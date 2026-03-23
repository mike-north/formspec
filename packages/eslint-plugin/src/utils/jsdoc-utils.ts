/**
 * Utility functions for extracting constraints from JSDoc comments.
 */

import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import type { SourceCode } from "@typescript-eslint/utils/ts-eslint";
import { BUILTIN_CONSTRAINT_DEFINITIONS } from "@formspec/core";

/** A constraint extracted from a JSDoc comment tag. */
export interface JSDocConstraint {
  /** The constraint name (e.g., "Minimum", "Maximum") */
  name: string;
  /** The parsed value */
  value: number | string;
  /** The comment node (for error reporting location) */
  comment: TSESTree.Comment;
}

const NUMERIC_TAG_NAMES = Object.keys(BUILTIN_CONSTRAINT_DEFINITIONS).filter(
  (k) => BUILTIN_CONSTRAINT_DEFINITIONS[k as keyof typeof BUILTIN_CONSTRAINT_DEFINITIONS] === "number"
);
const NUMERIC_TAGS_PATTERN = NUMERIC_TAG_NAMES.join("|");

// Numeric tags: value stops at the next `@` tag, `*/`, or end-of-line
const NUMERIC_TAG_REGEX = new RegExp(
  `@(${NUMERIC_TAGS_PATTERN})\\s+(.+?)(?=\\s*@|\\s*\\*\\/|\\s*$)`,
  "gm"
);

// Pattern tag: value captures everything until `*/` or end-of-line,
// because regex patterns can contain `@` (e.g., email validation)
const PATTERN_TAG_REGEX = /@Pattern\s+(.+?)(?=\s*\*\/|\s*$)/gm;

/**
 * Extracts constraint tags from JSDoc comments preceding a node.
 *
 * @param node - The AST node to check for preceding JSDoc comments
 * @param sourceCode - The ESLint source code object
 * @returns Array of parsed JSDoc constraints
 */
export function getJSDocConstraints(
  node: TSESTree.Node,
  sourceCode: SourceCode
): JSDocConstraint[] {
  // Collect comments before the node itself
  const comments = [...sourceCode.getCommentsBefore(node)];

  // For PropertyDefinition with decorators, also collect comments before the
  // property key — JSDoc comments placed between decorators and the property
  // name are not "before" the PropertyDefinition node in typescript-eslint ASTs.
  if (node.type === AST_NODE_TYPES.PropertyDefinition && node.decorators.length > 0) {
    const keyComments = sourceCode.getCommentsBefore(node.key);
    for (const c of keyComments) {
      if (!comments.includes(c)) {
        comments.push(c);
      }
    }
  }

  const results: JSDocConstraint[] = [];

  for (const comment of comments) {
    // Only process JSDoc-style block comments (/** ... */)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- TSESTree.Comment uses "Block"/"Line" strings, not AST_NODE_TYPES enum
    if (comment.type !== "Block" || !comment.value.startsWith("*")) {
      continue;
    }

    // Extract numeric constraint tags (Minimum, Maximum, MinLength, etc.)
    NUMERIC_TAG_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = NUMERIC_TAG_REGEX.exec(comment.value)) !== null) {
      const name = match[1];
      const rawValue = match[2];
      if (!name || !rawValue) continue;

      const cleanedValue = rawValue.replace(/^\s*\*\s*/gm, "").trim();
      const parsed = Number(cleanedValue);
      if (Number.isNaN(parsed)) continue;
      results.push({ name, value: parsed, comment });
    }

    // Extract @Pattern separately — its value can contain `@` (e.g., email regex)
    PATTERN_TAG_REGEX.lastIndex = 0;
    while ((match = PATTERN_TAG_REGEX.exec(comment.value)) !== null) {
      const rawValue = match[1];
      if (!rawValue) continue;

      const cleanedValue = rawValue.replace(/^\s*\*\s*/gm, "").trim();
      if (cleanedValue === "") continue;
      results.push({ name: "Pattern", value: cleanedValue, comment });
    }
  }

  return results;
}

/**
 * Finds a specific constraint by name in a JSDoc constraints array.
 *
 * @param constraints - The array of JSDoc constraints to search
 * @param name - The constraint name to find
 * @returns The matching constraint or null if not found
 */
export function findJSDocConstraint(
  constraints: JSDocConstraint[],
  name: string
): JSDocConstraint | null {
  return constraints.find((c) => c.name === name) ?? null;
}
