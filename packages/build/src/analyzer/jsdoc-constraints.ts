/**
 * JSDoc constraint and annotation extractor.
 *
 * Extracts constraints and annotation tags from JSDoc comments on
 * class/interface fields and returns canonical IR nodes directly:
 * - {@link ConstraintNode} for set-influencing tags (@minimum, @pattern, etc.)
 * - {@link AnnotationNode} for value-influencing tags (@displayName, etc.)
 *
 * The IR extraction path uses the official `@microsoft/tsdoc` parser for
 * all canonical tags.
 *
 * Supported constraints correspond to the built-in FormSpec constraint tags
 * (e.g., `@minimum`, `@maximum`, `@pattern`).
 */

import * as ts from "typescript";
import type { ConstraintNode, AnnotationNode, JsonValue } from "@formspec/core/internals";
import {
  parseTSDocTags,
  type ParseTSDocOptions,
  type TSDocParseResult,
} from "./tsdoc-parser.js";

// =============================================================================
// IR API — uses @microsoft/tsdoc for structured parsing
// =============================================================================

export function extractJSDocParseResult(
  node: ts.Node,
  file = "",
  options?: ParseTSDocOptions
): TSDocParseResult {
  return parseTSDocTags(node, file, options);
}

/**
 * Extracts constraints from JSDoc comments on a TypeScript AST node and returns
 * canonical {@link ConstraintNode} objects.
 *
 * Uses the official `@microsoft/tsdoc` parser for structured tag extraction.
 * Constraints are registered as custom block tags in the TSDoc configuration.
 *
 * @param node - The AST node to inspect for JSDoc tags
 * @param file - Absolute path to the source file for provenance
 * @returns Canonical constraint nodes for each valid constraint tag
 */
export function extractJSDocConstraintNodes(
  node: ts.Node,
  file = "",
  options?: ParseTSDocOptions
): ConstraintNode[] {
  const result = extractJSDocParseResult(node, file, options);
  return [...result.constraints];
}

/**
 * Extracts canonical annotation tags from a node and returns
 * {@link AnnotationNode} objects.
 *
 * @param node - The AST node to inspect for annotation tags
 * @param file - Absolute path to the source file for provenance
 * @returns Canonical annotation nodes
 */
export function extractJSDocAnnotationNodes(
  node: ts.Node,
  file = "",
  options?: ParseTSDocOptions
): AnnotationNode[] {
  const result = extractJSDocParseResult(node, file, options);
  return [...result.annotations];
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
