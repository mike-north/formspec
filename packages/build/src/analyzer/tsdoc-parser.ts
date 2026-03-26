/**
 * TSDoc-based structured tag parser.
 *
 * Bridges the TypeScript compiler AST with the official `@microsoft/tsdoc`
 * parser to extract constraint and annotation tags from JSDoc comments
 * on class/interface/type-alias properties.
 *
 * The parser recognises two categories of tags:
 *
 * 1. **Constraint tags** (all alphanumeric, TSDoc-compliant):
 *    `@minimum`, `@maximum`, `@exclusiveMinimum`, `@exclusiveMaximum`,
 *    `@multipleOf`, `@minLength`, `@maxLength`, `@minItems`, `@maxItems`,
 *    `@uniqueItems`, `@pattern`, `@enumOptions`, `@const`
 *    — Parsed via TSDocParser as custom block tags.
 *    Both camelCase and PascalCase forms are accepted (e.g., `@Minimum`).
 *
 * 2. **Annotation tags** (`@displayName`, `@description`, `@format`, `@placeholder`):
 *    These are parsed as structured custom block tags and mapped directly
 *    onto annotation IR nodes.
 *
 * The `@deprecated` tag is a standard TSDoc block tag, parsed structurally.
 *
 * **Fallback strategy**: TSDoc treats `{` / `}` as inline tag delimiters and
 * `@` as a tag prefix, so content containing these characters (e.g. JSON
 * objects in `@EnumOptions`, regex patterns with `@` in `@Pattern`) gets
 * mangled by the TSDoc parser. For these tags, the raw text is extracted
 * via the TS compiler's `ts.getJSDocTags()` API which preserves content
 * verbatim.
 */

import * as ts from "typescript";
import {
  TSDocParser,
  TSDocConfiguration,
  TSDocTagDefinition,
  TSDocTagSyntaxKind,
  DocPlainText,
  DocSoftBreak,
  TextRange,
  type DocNode,
  type DocBlock,
} from "@microsoft/tsdoc";
import {
  BUILTIN_CONSTRAINT_DEFINITIONS,
  normalizeConstraintTagName,
  isBuiltinConstraintName,
  type ConstraintNode,
  type AnnotationNode,
  type Provenance,
  type NumericConstraintNode,
  type LengthConstraintNode,
  type PathTarget,
  type JsonValue,
  type TypeNode,
} from "@formspec/core";
import type { ExtensionRegistry } from "../extensions/index.js";
import { tryParseJson } from "./json-utils.js";

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Constraint tag name → constraint kind mapping for numeric constraints.
 * Keys are camelCase matching BUILTIN_CONSTRAINT_DEFINITIONS.
 */
const NUMERIC_CONSTRAINT_MAP: Record<string, NumericConstraintNode["constraintKind"]> = {
  minimum: "minimum",
  maximum: "maximum",
  exclusiveMinimum: "exclusiveMinimum",
  exclusiveMaximum: "exclusiveMaximum",
  multipleOf: "multipleOf",
};

/**
 * Constraint tag name → constraint kind mapping for length constraints.
 * Keys are camelCase matching BUILTIN_CONSTRAINT_DEFINITIONS.
 */
const LENGTH_CONSTRAINT_MAP: Record<string, LengthConstraintNode["constraintKind"]> = {
  minLength: "minLength",
  maxLength: "maxLength",
  minItems: "minItems",
  maxItems: "maxItems",
};

/**
 * Tags whose content may contain TSDoc-significant characters (`{}`, `@`)
 * and must be extracted via the TS compiler JSDoc API rather than the
 * TSDoc DocNode tree to avoid content mangling.
 *
 * - `@pattern`: regex patterns commonly contain `@` (e.g. email validation)
 * - `@enumOptions`: JSON arrays may contain object literals with `{}`
 * - `@defaultValue`: JSON defaults may contain objects, arrays, or quoted strings
 */
const TAGS_REQUIRING_RAW_TEXT = new Set(["pattern", "enumOptions", "defaultValue"]);

/**
 * Creates a TSDocConfiguration with FormSpec custom block tag definitions
 * registered for all constraint tags.
 */
function createFormSpecTSDocConfig(extensionTagNames: readonly string[] = []): TSDocConfiguration {
  const config = new TSDocConfiguration();

  // Register each constraint tag as a custom block tag (allowMultiple so
  // repeated tags don't produce warnings).
  for (const tagName of Object.keys(BUILTIN_CONSTRAINT_DEFINITIONS)) {
    config.addTagDefinition(
      new TSDocTagDefinition({
        tagName: "@" + tagName,
        syntaxKind: TSDocTagSyntaxKind.BlockTag,
        allowMultiple: true,
      })
    );
  }

  // Register annotation tags that participate in the canonical IR.
  for (const tagName of ["displayName", "description", "format", "placeholder"]) {
    config.addTagDefinition(
      new TSDocTagDefinition({
        tagName: "@" + tagName,
        syntaxKind: TSDocTagSyntaxKind.BlockTag,
        allowMultiple: true,
      })
    );
  }

  for (const tagName of extensionTagNames) {
    config.addTagDefinition(
      new TSDocTagDefinition({
        tagName: "@" + tagName,
        syntaxKind: TSDocTagSyntaxKind.BlockTag,
        allowMultiple: true,
      })
    );
  }

  return config;
}

/**
 * Shared parser instance — thread-safe because TSDocParser is stateless;
 * all parse state lives in the returned ParserContext.
 */
const parserCache = new Map<string, TSDocParser>();

function getParser(options?: ParseTSDocOptions): TSDocParser {
  const extensionTagNames = [
    ...(options?.extensionRegistry?.extensions.flatMap((extension) =>
      (extension.constraintTags ?? []).map((tag) => tag.tagName)
    ) ?? []),
  ].sort();
  const cacheKey = extensionTagNames.join("|");
  const existing = parserCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const parser = new TSDocParser(createFormSpecTSDocConfig(extensionTagNames));
  parserCache.set(cacheKey, parser);
  return parser;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Result of parsing a single JSDoc comment attached to a TS AST node.
 */
export interface TSDocParseResult {
  /** Constraint IR nodes extracted from custom block tags. */
  readonly constraints: readonly ConstraintNode[];
  /** Annotation IR nodes extracted from canonical TSDoc block tags. */
  readonly annotations: readonly AnnotationNode[];
}

/**
 * Optional extension-aware parsing inputs for TSDoc extraction.
 */
export interface ParseTSDocOptions {
  /**
   * Extension registry used to resolve custom tags and custom-type-specific
   * broadening of built-in constraint tags.
   */
  readonly extensionRegistry?: ExtensionRegistry;
  /**
   * Effective field/type node for the declaration being parsed. Required when
   * built-in tags may broaden onto a custom type.
   */
  readonly fieldType?: TypeNode;
}

/**
 * Display-name metadata extracted from a node's JSDoc tags.
 *
 * The root display name is returned separately from member-target labels so
 * callers can apply the former to the enclosing type/form and the latter to
 * enum members.
 */
export interface DisplayNameMetadata {
  readonly displayName?: string;
  readonly memberDisplayNames: ReadonlyMap<string, string>;
}

/**
 * Parses the JSDoc comment attached to a TypeScript AST node using the
 * official TSDoc parser and returns canonical IR constraint and annotation
 * nodes.
 *
 * For constraint tags (`@minimum`, `@pattern`, `@enumOptions`, etc.),
 * the structured TSDoc parser is used. Canonical annotation tags
 * (`@displayName`, `@description`) are also parsed structurally.
 *
 * @param node - The TS AST node to inspect (PropertyDeclaration, PropertySignature, etc.)
 * @param file - Absolute source file path for provenance
 * @returns Parsed constraint and annotation nodes
 */
export function parseTSDocTags(
  node: ts.Node,
  file = "",
  options?: ParseTSDocOptions
): TSDocParseResult {
  const constraints: ConstraintNode[] = [];
  const annotations: AnnotationNode[] = [];
  let displayName: string | undefined;
  let description: string | undefined;
  let placeholder: string | undefined;
  let displayNameProvenance: Provenance | undefined;
  let descriptionProvenance: Provenance | undefined;
  let placeholderProvenance: Provenance | undefined;

  // ----- Phase 1: TSDoc structural parse for constraint tags -----
  const sourceFile = node.getSourceFile();
  const sourceText = sourceFile.getFullText();
  const commentRanges = ts.getLeadingCommentRanges(sourceText, node.getFullStart());

  if (commentRanges) {
    for (const range of commentRanges) {
      // Only parse /** ... */ comments (kind 3 = MultiLineCommentTrivia)
      if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia) {
        continue;
      }
      const commentText = sourceText.substring(range.pos, range.end);
      if (!commentText.startsWith("/**")) {
        continue;
      }

      const parser = getParser(options);
      const parserContext = parser.parseRange(
        TextRange.fromStringRange(sourceText, range.pos, range.end)
      );
      const docComment = parserContext.docComment;

      // Extract constraint nodes from custom blocks.
      // Tags in TAGS_REQUIRING_RAW_TEXT are skipped here and handled via the
      // TS compiler API in Phase 1b below.
      for (const block of docComment.customBlocks) {
        const tagName = normalizeConstraintTagName(block.blockTag.tagName.substring(1)); // Remove leading @ and normalize to camelCase
        if (
          tagName === "displayName" ||
          tagName === "description" ||
          tagName === "format" ||
          tagName === "placeholder"
        ) {
          const text = extractBlockText(block).trim();
          if (text === "") continue;

          const provenance = provenanceForComment(range, sourceFile, file, tagName);
          if (tagName === "displayName") {
            if (!isMemberTargetDisplayName(text) && displayName === undefined) {
              displayName = text;
              displayNameProvenance = provenance;
            }
          } else if (tagName === "format") {
            annotations.push({
              kind: "annotation",
              annotationKind: "format",
              value: text,
              provenance,
            });
          } else {
            if (tagName === "description" && description === undefined) {
              description = text;
              descriptionProvenance = provenance;
            } else if (tagName === "placeholder" && placeholder === undefined) {
              placeholder = text;
              placeholderProvenance = provenance;
            }
          }
          continue;
        }

        if (TAGS_REQUIRING_RAW_TEXT.has(tagName)) continue;

        const text = extractBlockText(block).trim();
        const expectedType = isBuiltinConstraintName(tagName)
          ? BUILTIN_CONSTRAINT_DEFINITIONS[tagName]
          : undefined;
        if (text === "" && expectedType !== "boolean") continue;

        const provenance = provenanceForComment(range, sourceFile, file, tagName);
        const constraintNode = parseConstraintValue(tagName, text, provenance, options);
        if (constraintNode) {
          constraints.push(constraintNode);
        }
      }

      // Extract @deprecated from the standard deprecated block
      if (docComment.deprecatedBlock !== undefined) {
        const message = extractBlockText(docComment.deprecatedBlock).trim();
        annotations.push({
          kind: "annotation",
          annotationKind: "deprecated",
          ...(message !== "" && { message }),
          provenance: provenanceForComment(range, sourceFile, file, "deprecated"),
        });
      }

      if (description === undefined && docComment.remarksBlock !== undefined) {
        const remarks = extractBlockText(docComment.remarksBlock).trim();
        if (remarks !== "") {
          description = remarks;
          descriptionProvenance = provenanceForComment(range, sourceFile, file, "remarks");
        }
      }
    }
  }

  if (displayName !== undefined && displayNameProvenance !== undefined) {
    annotations.push({
      kind: "annotation",
      annotationKind: "displayName",
      value: displayName,
      provenance: displayNameProvenance,
    });
  }

  if (description !== undefined && descriptionProvenance !== undefined) {
    annotations.push({
      kind: "annotation",
      annotationKind: "description",
      value: description,
      provenance: descriptionProvenance,
    });
  }

  if (placeholder !== undefined && placeholderProvenance !== undefined) {
    annotations.push({
      kind: "annotation",
      annotationKind: "placeholder",
      value: placeholder,
      provenance: placeholderProvenance,
    });
  }

  // ----- Phase 1b: TS compiler API for tags with TSDoc-incompatible content -----
  // @pattern, @enumOptions, and @defaultValue content can contain `@`, `{}`,
  // or quoted JSON payloads that the TSDoc parser treats as structural markers.
  // We extract these via the TS compiler API which preserves content verbatim.
  const jsDocTagsAll = ts.getJSDocTags(node);
  for (const tag of jsDocTagsAll) {
    const tagName = normalizeConstraintTagName(tag.tagName.text);
    if (!TAGS_REQUIRING_RAW_TEXT.has(tagName)) continue;

    const commentText = getTagCommentText(tag);
    if (commentText === undefined || commentText.trim() === "") continue;

    const text = commentText.trim();
    const provenance = provenanceForJSDocTag(tag, file);
    if (tagName === "defaultValue") {
      const defaultValueNode = parseDefaultValueValue(text, provenance);
      annotations.push(defaultValueNode);
      continue;
    }

    const constraintNode = parseConstraintValue(tagName, text, provenance, options);
    if (constraintNode) {
      constraints.push(constraintNode);
    }
  }

  for (const tag of jsDocTagsAll) {
    const tagName = normalizeConstraintTagName(tag.tagName.text);
    if (
      isBuiltinConstraintName(tagName) ||
      TAGS_REQUIRING_RAW_TEXT.has(tagName) ||
      options?.extensionRegistry?.findConstraintTag(tagName) !== undefined
    ) {
      continue;
    }

    const commentText = getTagCommentText(tag);
    if (commentText === undefined || commentText.trim() === "") continue;

    const provenance = provenanceForJSDocTag(tag, file);
    const constraintNode = parseConstraintValue(tagName, commentText.trim(), provenance, options);
    if (constraintNode) {
      constraints.push(constraintNode);
    }
  }

  return { constraints, annotations };
}

/**
 * Checks if a TS AST node has a `@deprecated` tag using the TSDoc parser.
 *
 * Falls back to the TS compiler API for nodes without doc comments.
 */
export function hasDeprecatedTagTSDoc(node: ts.Node): boolean {
  const sourceFile = node.getSourceFile();
  const sourceText = sourceFile.getFullText();
  const commentRanges = ts.getLeadingCommentRanges(sourceText, node.getFullStart());

  if (commentRanges) {
    for (const range of commentRanges) {
      if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
      const commentText = sourceText.substring(range.pos, range.end);
      if (!commentText.startsWith("/**")) continue;

      const parser = getParser();
      const parserContext = parser.parseRange(
        TextRange.fromStringRange(sourceText, range.pos, range.end)
      );
      if (parserContext.docComment.deprecatedBlock !== undefined) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Extracts root and member-target display-name metadata from a node's JSDoc tags.
 *
 * Member-target display-name tags use the syntax `@displayName :member Label`.
 * The first non-target `@displayName` is returned as the root display name.
 */
export function extractDisplayNameMetadata(node: ts.Node): DisplayNameMetadata {
  let displayName: string | undefined;
  const memberDisplayNames = new Map<string, string>();

  for (const tag of ts.getJSDocTags(node)) {
    const tagName = normalizeConstraintTagName(tag.tagName.text);
    if (tagName !== "displayName") continue;

    const commentText = getTagCommentText(tag);
    if (commentText === undefined) continue;

    const text = commentText.trim();
    if (text === "") continue;

    const memberTarget = parseMemberTargetDisplayName(text);
    if (memberTarget) {
      memberDisplayNames.set(memberTarget.target, memberTarget.label);
      continue;
    }

    displayName ??= text;
  }

  return {
    ...(displayName !== undefined && { displayName }),
    memberDisplayNames,
  };
}

// =============================================================================
// PUBLIC HELPERS — path target extraction
// =============================================================================

/**
 * Extracts a path-target prefix (`:fieldName`) from constraint tag text.
 * Returns the parsed PathTarget and remaining text, or null if no path target.
 *
 * @example
 * extractPathTarget(":value 0") // → { path: { segments: ["value"] }, remainingText: "0" }
 * extractPathTarget("42")       // → null
 */
export function extractPathTarget(
  text: string
): { path: PathTarget; remainingText: string } | null {
  const trimmed = text.trimStart();
  const match = /^:([a-zA-Z_]\w*)\s+([\s\S]*)$/.exec(trimmed);
  if (!match?.[1] || !match[2]) return null;
  return {
    path: { segments: [match[1]] },
    remainingText: match[2],
  };
}

// =============================================================================
// PRIVATE HELPERS — TSDoc text extraction
// =============================================================================

/**
 * Recursively extracts plain text content from a TSDoc DocNode tree.
 *
 * Walks child nodes and concatenates DocPlainText and DocSoftBreak content.
 */
function extractBlockText(block: DocBlock): string {
  return extractPlainText(block.content);
}

function extractPlainText(node: DocNode): string {
  let result = "";
  if (node instanceof DocPlainText) {
    return node.text;
  }
  if (node instanceof DocSoftBreak) {
    return " ";
  }
  if (typeof node.getChildNodes === "function") {
    for (const child of node.getChildNodes()) {
      result += extractPlainText(child);
    }
  }
  return result;
}

// =============================================================================
// PRIVATE HELPERS — constraint value parsing
// =============================================================================

/**
 * Parses a raw text value extracted from a TSDoc block tag into an IR
 * ConstraintNode based on the tag name and BUILTIN_CONSTRAINT_DEFINITIONS.
 *
 * @param tagName - camelCase-normalized constraint tag name (callers normalize before calling)
 */
function parseConstraintValue(
  tagName: string,
  text: string,
  provenance: Provenance,
  options?: ParseTSDocOptions
): ConstraintNode | null {
  const customConstraint = parseExtensionConstraintValue(tagName, text, provenance, options);
  if (customConstraint) {
    return customConstraint;
  }

  if (!isBuiltinConstraintName(tagName)) {
    return null;
  }

  // Extract optional path target (e.g., ":value 0" → path=["value"], text="0")
  const pathResult = extractPathTarget(text);
  const effectiveText = pathResult ? pathResult.remainingText : text;
  const path = pathResult?.path;

  const expectedType = BUILTIN_CONSTRAINT_DEFINITIONS[tagName];

  if (expectedType === "number") {
    const value = Number(effectiveText);
    if (Number.isNaN(value)) {
      return null;
    }

    const numericKind = NUMERIC_CONSTRAINT_MAP[tagName];
    if (numericKind) {
      return {
        kind: "constraint",
        constraintKind: numericKind,
        value,
        ...(path && { path }),
        provenance,
      };
    }

    const lengthKind = LENGTH_CONSTRAINT_MAP[tagName];
    if (lengthKind) {
      return {
        kind: "constraint",
        constraintKind: lengthKind,
        value,
        ...(path && { path }),
        provenance,
      };
    }

    return null;
  }

  if (expectedType === "boolean") {
    const trimmed = effectiveText.trim();
    if (trimmed !== "" && trimmed !== "true") {
      return null;
    }

    if (tagName === "uniqueItems") {
      return {
        kind: "constraint",
        constraintKind: "uniqueItems",
        value: true,
        ...(path && { path }),
        provenance,
      };
    }

    return null;
  }

  if (expectedType === "json") {
    if (tagName === "const") {
      const trimmedText = effectiveText.trim();
      if (trimmedText === "") return null;

      try {
        const parsed = JSON.parse(trimmedText) as JsonValue;
        return {
          kind: "constraint",
          constraintKind: "const",
          value: parsed,
          ...(path && { path }),
          provenance,
        };
      } catch {
        // Bare strings like `@const USD` are accepted as a shorthand for
        // string-valued const constraints. Non-string malformed JSON still
        // gets rejected later during IR validation if the field type is
        // incompatible with this fallback string value.
        return {
          kind: "constraint",
          constraintKind: "const",
          value: trimmedText,
          ...(path && { path }),
          provenance,
        };
      }
    }

    const parsed = tryParseJson(effectiveText);
    if (!Array.isArray(parsed)) {
      return null;
    }
    const members: (string | number)[] = [];
    for (const item of parsed) {
      if (typeof item === "string" || typeof item === "number") {
        members.push(item);
      } else if (typeof item === "object" && item !== null && "id" in item) {
        const id = (item as Record<string, unknown>)["id"];
        if (typeof id === "string" || typeof id === "number") {
          members.push(id);
        }
      }
    }
    return {
      kind: "constraint",
      constraintKind: "allowedMembers",
      members,
      ...(path && { path }),
      provenance,
    };
  }

  // expectedType === "string" — only remaining case after number and json
  return {
    kind: "constraint",
    constraintKind: "pattern",
    pattern: effectiveText,
    ...(path && { path }),
    provenance,
  };
}

function parseExtensionConstraintValue(
  tagName: string,
  text: string,
  provenance: Provenance,
  options?: ParseTSDocOptions
): ConstraintNode | null {
  const pathResult = extractPathTarget(text);
  const effectiveText = pathResult ? pathResult.remainingText : text;
  const path = pathResult?.path;
  const registry = options?.extensionRegistry;
  if (registry === undefined) {
    return null;
  }

  const directTag = registry.findConstraintTag(tagName);
  if (directTag !== undefined) {
    return makeCustomConstraintNode(
      directTag.extensionId,
      directTag.registration.constraintName,
      directTag.registration.parseValue(effectiveText),
      provenance,
      path,
      registry
    );
  }

  const fieldType = options?.fieldType;
  if (fieldType?.kind !== "custom" || !isBuiltinConstraintName(tagName)) {
    return null;
  }

  const broadened = registry.findBuiltinConstraintBroadening(fieldType.typeId, tagName);
  if (broadened === undefined) {
    return null;
  }

  return makeCustomConstraintNode(
    broadened.extensionId,
    broadened.registration.constraintName,
    broadened.registration.parseValue(effectiveText),
    provenance,
    path,
    registry
  );
}

function makeCustomConstraintNode(
  extensionId: string,
  constraintName: string,
  payload: JsonValue,
  provenance: Provenance,
  path: PathTarget | undefined,
  registry: ExtensionRegistry
): ConstraintNode {
  const constraintId = `${extensionId}/${constraintName}`;
  const registration = registry.findConstraint(constraintId);
  if (registration === undefined) {
    throw new Error(
      `Custom TSDoc tag resolved to unregistered constraint "${constraintId}". Register the constraint before using its tag.`
    );
  }

  return {
    kind: "constraint",
    constraintKind: "custom",
    constraintId,
    payload,
    compositionRule: registration.compositionRule,
    ...(path && { path }),
    provenance,
  };
}

/**
 * Parses a raw `@defaultValue` tag payload into a JSON value annotation.
 */
function parseDefaultValueValue(text: string, provenance: Provenance): AnnotationNode {
  const trimmed = text.trim();
  let value: JsonValue;

  if (trimmed === "null") {
    value = null;
  } else if (trimmed === "true") {
    value = true;
  } else if (trimmed === "false") {
    value = false;
  } else {
    const parsed = tryParseJson(trimmed);
    value = parsed !== null ? (parsed as JsonValue) : trimmed;
  }

  return {
    kind: "annotation",
    annotationKind: "defaultValue",
    value,
    provenance,
  };
}

function isMemberTargetDisplayName(text: string): boolean {
  return parseMemberTargetDisplayName(text) !== null;
}

function parseMemberTargetDisplayName(
  text: string
): { readonly target: string; readonly label: string } | null {
  const match = /^:([^\s]+)\s+([\s\S]+)$/.exec(text);
  if (!match?.[1] || !match[2]) return null;
  return { target: match[1], label: match[2].trim() };
}

// =============================================================================
// PRIVATE HELPERS — provenance
// =============================================================================

function provenanceForComment(
  range: ts.CommentRange,
  sourceFile: ts.SourceFile,
  file: string,
  tagName: string
): Provenance {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(range.pos);
  return {
    surface: "tsdoc",
    file,
    line: line + 1,
    column: character,
    tagName: "@" + tagName,
  };
}

function provenanceForJSDocTag(tag: ts.JSDocTag, file: string): Provenance {
  const sourceFile = tag.getSourceFile();
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(tag.getStart());
  return {
    surface: "tsdoc",
    file,
    line: line + 1,
    column: character,
    tagName: "@" + tag.tagName.text,
  };
}

/**
 * Extracts the text content from a TypeScript JSDoc tag's comment.
 */
function getTagCommentText(tag: ts.JSDocTag): string | undefined {
  if (tag.comment === undefined) {
    return undefined;
  }
  if (typeof tag.comment === "string") {
    return tag.comment;
  }
  return ts.getTextOfJSDocComment(tag.comment);
}
