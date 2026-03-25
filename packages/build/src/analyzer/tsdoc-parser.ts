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
 *    `@pattern`, `@enumOptions`
 *    — Parsed via TSDocParser as custom block tags.
 *    Both camelCase and PascalCase forms are accepted (e.g., `@Minimum`).
 *
 * 2. **Annotation tags** (`@Field_displayName`, `@Field_description`):
 *    These contain underscores which are not valid in TSDoc tag names.
 *    They are extracted via the TypeScript compiler's `ts.getJSDocTags()`
 *    until a future migration to underscore-free tag names.
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
} from "@formspec/core";

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
 */
const TAGS_REQUIRING_RAW_TEXT = new Set(["pattern", "enumOptions"]);

/**
 * Creates a TSDocConfiguration with FormSpec custom block tag definitions
 * registered for all constraint tags.
 */
function createFormSpecTSDocConfig(): TSDocConfiguration {
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

  return config;
}

/**
 * Shared parser instance — thread-safe because TSDocParser is stateless;
 * all parse state lives in the returned ParserContext.
 */
let sharedParser: TSDocParser | undefined;

function getParser(): TSDocParser {
  sharedParser ??= new TSDocParser(createFormSpecTSDocConfig());
  return sharedParser;
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
  /** Annotation IR nodes extracted from modifier/block tags and TS JSDoc API. */
  readonly annotations: readonly AnnotationNode[];
}

/**
 * Parses the JSDoc comment attached to a TypeScript AST node using the
 * official TSDoc parser and returns canonical IR constraint and annotation
 * nodes.
 *
 * For constraint tags (`@minimum`, `@pattern`, `@enumOptions`, etc.),
 * the structured TSDoc parser is used. For annotation tags that contain
 * underscores (`@Field_displayName`, `@Field_description`), the TypeScript
 * compiler JSDoc API is used as a fallback.
 *
 * @param node - The TS AST node to inspect (PropertyDeclaration, PropertySignature, etc.)
 * @param file - Absolute source file path for provenance
 * @returns Parsed constraint and annotation nodes
 */
export function parseTSDocTags(node: ts.Node, file = ""): TSDocParseResult {
  const constraints: ConstraintNode[] = [];
  const annotations: AnnotationNode[] = [];

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

      const parser = getParser();
      const parserContext = parser.parseRange(
        TextRange.fromStringRange(sourceText, range.pos, range.end)
      );
      const docComment = parserContext.docComment;

      // Extract constraint nodes from custom blocks.
      // Tags in TAGS_REQUIRING_RAW_TEXT are skipped here and handled via the
      // TS compiler API in Phase 1b below.
      for (const block of docComment.customBlocks) {
        const tagName = normalizeConstraintTagName(block.blockTag.tagName.substring(1)); // Remove leading @ and normalize to camelCase
        if (TAGS_REQUIRING_RAW_TEXT.has(tagName)) continue;

        const text = extractBlockText(block).trim();
        if (text === "") continue;

        const provenance = provenanceForComment(range, sourceFile, file, tagName);
        const constraintNode = parseConstraintValue(tagName, text, provenance);
        if (constraintNode) {
          constraints.push(constraintNode);
        }
      }

      // Extract @deprecated from the standard deprecated block
      if (docComment.deprecatedBlock !== undefined) {
        annotations.push({
          kind: "annotation",
          annotationKind: "deprecated",
          provenance: provenanceForComment(range, sourceFile, file, "deprecated"),
        });
      }
    }
  }

  // ----- Phase 1b: TS compiler API for tags with TSDoc-incompatible content -----
  // @pattern and @enumOptions content can contain `@` and `{}` characters
  // which the TSDoc parser treats as structural markers. We extract these
  // via the TS compiler API which preserves content verbatim.
  const jsDocTagsAll = ts.getJSDocTags(node);
  for (const tag of jsDocTagsAll) {
    const tagName = normalizeConstraintTagName(tag.tagName.text);
    if (!TAGS_REQUIRING_RAW_TEXT.has(tagName)) continue;

    const commentText = getTagCommentText(tag);
    if (commentText === undefined || commentText.trim() === "") continue;

    const text = commentText.trim();
    const provenance = provenanceForJSDocTag(tag, file);
    const constraintNode = parseConstraintValue(tagName, text, provenance);
    if (constraintNode) {
      constraints.push(constraintNode);
    }
  }

  // ----- Phase 2: TS compiler JSDoc API for underscore-containing annotation tags -----
  // @Field_displayName and @Field_description contain underscores which
  // are invalid in TSDoc tag names. We extract them via the TS compiler API.
  let displayName: string | undefined;
  let description: string | undefined;
  let displayNameTag: ts.JSDocTag | undefined;
  let descriptionTag: ts.JSDocTag | undefined;

  for (const tag of jsDocTagsAll) {
    const tagName = tag.tagName.text;
    const commentText = getTagCommentText(tag);
    if (commentText === undefined || commentText.trim() === "") {
      continue;
    }

    const trimmed = commentText.trim();

    if (tagName === "Field_displayName") {
      displayName = trimmed;
      displayNameTag = tag;
    } else if (tagName === "Field_description") {
      description = trimmed;
      descriptionTag = tag;
    }
  }

  if (displayName !== undefined && displayNameTag) {
    annotations.push({
      kind: "annotation",
      annotationKind: "displayName",
      value: displayName,
      provenance: provenanceForJSDocTag(displayNameTag, file),
    });
  }

  if (description !== undefined && descriptionTag) {
    annotations.push({
      kind: "annotation",
      annotationKind: "description",
      value: description,
      provenance: provenanceForJSDocTag(descriptionTag, file),
    });
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
  provenance: Provenance
): ConstraintNode | null {
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

  if (expectedType === "json") {
    try {
      const parsed: unknown = JSON.parse(effectiveText);
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
    } catch {
      return null;
    }
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
