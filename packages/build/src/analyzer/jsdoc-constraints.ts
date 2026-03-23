/**
 * JSDoc constraint tag and annotation extractor.
 *
 * Extracts constraint tags and annotation tags from JSDoc comments on
 * class/interface fields and returns canonical IR nodes directly:
 * - {@link ConstraintNode} for set-influencing tags (@Minimum, @Pattern, etc.)
 * - {@link AnnotationNode} for value-influencing tags (@Field_displayName, etc.)
 *
 * The IR extraction path uses the official `@microsoft/tsdoc` parser for
 * constraint tags (all TSDoc-compliant alphanumeric names) and the TypeScript
 * compiler JSDoc API for annotation tags (which contain underscores, e.g.
 * `@Field_displayName`).
 *
 * Supported constraint tags correspond to keys in {@link CONSTRAINT_TAG_DEFINITIONS}
 * from `@formspec/core` (e.g., `@Minimum`, `@Maximum`, `@Pattern`).
 */

import * as ts from "typescript";
import {
  CONSTRAINT_TAG_DEFINITIONS,
  type ConstraintTagName,
  type ConstraintNode,
  type AnnotationNode,
  type JsonValue,
} from "@formspec/core";
import { parseTSDocTags, hasDeprecatedTagTSDoc } from "./tsdoc-parser.js";

// =============================================================================
// Legacy types — previously in decorator-extractor.ts, now owned here
// =============================================================================

/**
 * A constraint argument value.
 */
export type ConstraintArg =
  | string
  | number
  | boolean
  | null
  | ConstraintArg[]
  | { [key: string]: ConstraintArg };

/**
 * Extracted constraint information from a JSDoc tag.
 * @deprecated Use {@link ConstraintNode} from the IR path instead.
 */
export interface ConstraintInfo {
  /** Constraint name (e.g., "Minimum", "Pattern", "Field") */
  name: string;
  /** Constraint arguments as literal values */
  args: ConstraintArg[];
  /** Raw AST node (undefined for synthetic JSDoc constraint entries) */
  node: ts.Decorator | undefined;
}

// =============================================================================
// IR API — uses @microsoft/tsdoc for structured parsing
// =============================================================================

/**
 * Extracts JSDoc constraint tags from a TypeScript AST node and returns
 * canonical {@link ConstraintNode} objects.
 *
 * Uses the official `@microsoft/tsdoc` parser for structured tag extraction.
 * Constraint tags are registered as custom block tags in the TSDoc configuration.
 *
 * @param node - The AST node to inspect for JSDoc tags
 * @param file - Absolute path to the source file for provenance
 * @returns Canonical constraint nodes for each valid constraint tag
 */
export function extractJSDocConstraintNodes(node: ts.Node, file = ""): ConstraintNode[] {
  const result = parseTSDocTags(node, file);
  return [...result.constraints];
}

/**
 * Extracts `@Field_displayName`, `@Field_description`, and `@deprecated`
 * TSDoc tags from a node and returns canonical {@link AnnotationNode} objects.
 *
 * Uses a hybrid approach:
 * - `@deprecated` is extracted via the TSDoc parser (standard tag).
 * - `@Field_displayName` and `@Field_description` are extracted via the
 *   TypeScript compiler JSDoc API because they contain underscores which
 *   are invalid in TSDoc tag names.
 *
 * @param node - The AST node to inspect for annotation tags
 * @param file - Absolute path to the source file for provenance
 * @returns Canonical annotation nodes
 */
export function extractJSDocAnnotationNodes(node: ts.Node, file = ""): AnnotationNode[] {
  const result = parseTSDocTags(node, file);
  return [...result.annotations];
}

/**
 * Checks if a node has a TSDoc `@deprecated` tag.
 *
 * Uses the TSDoc parser for structured detection.
 */
export function hasDeprecatedTag(node: ts.Node): boolean {
  return hasDeprecatedTagTSDoc(node);
}

/**
 * Extracts a default value from a property initializer and returns a
 * {@link DefaultValueAnnotationNode} if present.
 *
 * Only extracts literal values (strings, numbers, booleans, null).
 */
export function extractDefaultValueAnnotation(
  initializer: ts.Expression | undefined,
  file = ""
): AnnotationNode | null {
  if (!initializer) return null;

  let value: JsonValue | undefined;

  if (ts.isStringLiteral(initializer)) {
    value = initializer.text;
  } else if (ts.isNumericLiteral(initializer)) {
    value = Number(initializer.text);
  } else if (initializer.kind === ts.SyntaxKind.TrueKeyword) {
    value = true;
  } else if (initializer.kind === ts.SyntaxKind.FalseKeyword) {
    value = false;
  } else if (initializer.kind === ts.SyntaxKind.NullKeyword) {
    value = null;
  } else if (ts.isPrefixUnaryExpression(initializer)) {
    if (
      initializer.operator === ts.SyntaxKind.MinusToken &&
      ts.isNumericLiteral(initializer.operand)
    ) {
      value = -Number(initializer.operand.text);
    }
  }

  if (value === undefined) return null;

  const sourceFile = initializer.getSourceFile();
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(initializer.getStart());

  return {
    kind: "annotation",
    annotationKind: "defaultValue",
    value,
    provenance: {
      surface: "tsdoc",
      file,
      line: line + 1,
      column: character,
    },
  };
}

// =============================================================================
// LEGACY API — backward compatibility for decorator-based pipeline
// =============================================================================

/**
 * Extracts JSDoc constraint tags and returns synthetic {@link ConstraintInfo}
 * objects for backward compatibility with the decorator-based pipeline.
 *
 * Uses the TypeScript compiler JSDoc API (not TSDoc parser) to maintain
 * identical behavior with the legacy pipeline.
 *
 * @deprecated Use {@link extractJSDocConstraintNodes} for IR output.
 */
export function extractJSDocConstraints(node: ts.Node): ConstraintInfo[] {
  const results: ConstraintInfo[] = [];
  const jsDocTags = ts.getJSDocTags(node);

  for (const tag of jsDocTags) {
    const tagName = tag.tagName.text;

    if (!(tagName in CONSTRAINT_TAG_DEFINITIONS)) {
      continue;
    }

    const constraintName = tagName as ConstraintTagName;
    const expectedType = CONSTRAINT_TAG_DEFINITIONS[constraintName];

    const commentText = getTagCommentText(tag);
    if (commentText === undefined || commentText === "") {
      continue;
    }

    const trimmed = commentText.trim();
    if (trimmed === "") {
      continue;
    }

    if (expectedType === "number") {
      const value = Number(trimmed);
      if (Number.isNaN(value)) {
        continue;
      }
      results.push(createSyntheticDecorator(constraintName, value));
    } else if (expectedType === "json") {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
          continue;
        }
        results.push(createSyntheticDecorator(constraintName, parsed as ConstraintArg));
      } catch {
        continue;
      }
    } else {
      results.push(createSyntheticDecorator(constraintName, trimmed));
    }
  }

  return results;
}

/**
 * Extracts `@Field_displayName` and `@Field_description` TSDoc tags
 * and returns a synthetic `Field` {@link ConstraintInfo} for backward
 * compatibility with the decorator-based pipeline.
 *
 * @deprecated Use {@link extractJSDocAnnotationNodes} for IR output.
 */
export function extractJSDocFieldMetadata(node: ts.Node): ConstraintInfo | null {
  const jsDocTags = ts.getJSDocTags(node);

  let displayName: string | undefined;
  let description: string | undefined;

  for (const tag of jsDocTags) {
    const tagName = tag.tagName.text;
    const commentText = getTagCommentText(tag);
    if (commentText === undefined || commentText.trim() === "") {
      continue;
    }

    const trimmed = commentText.trim();

    if (tagName === "Field_displayName") {
      displayName = trimmed;
    } else if (tagName === "Field_description") {
      description = trimmed;
    }
  }

  if (displayName === undefined && description === undefined) {
    return null;
  }

  const fieldOpts: Record<string, ConstraintArg> = {
    ...(displayName !== undefined ? { displayName } : {}),
    ...(description !== undefined ? { description } : {}),
  };

  return createSyntheticDecorator("Field", fieldOpts);
}

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

/**
 * Extracts the text content from a JSDoc tag's comment.
 *
 * The `tag.comment` property can be a plain string, an array of
 * `JSDocComment` nodes, or undefined. This helper normalises all
 * three cases to a single `string | undefined`.
 */
function getTagCommentText(tag: ts.JSDocTag): string | undefined {
  if (tag.comment === undefined) {
    return undefined;
  }
  if (typeof tag.comment === "string") {
    return tag.comment;
  }
  // NodeArray<JSDocComment> — concatenate text spans
  return ts.getTextOfJSDocComment(tag.comment);
}

/**
 * Creates a synthetic {@link ConstraintInfo} for backward compatibility.
 */
function createSyntheticDecorator(name: string, value: ConstraintArg): ConstraintInfo {
  return {
    name,
    args: [value],
    node: undefined,
  };
}
