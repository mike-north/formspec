/**
 * Utility functions for extracting constraint tags from JSDoc comments.
 */

import type { TSESTree } from "@typescript-eslint/utils";
import type { SourceCode } from "@typescript-eslint/utils/ts-eslint";
import { CONSTRAINT_TAG_DEFINITIONS } from "@formspec/core";

/** A constraint extracted from a JSDoc comment tag. */
export interface JSDocConstraint {
  /** The constraint name (e.g., "Minimum", "Maximum") */
  name: string;
  /** The parsed value */
  value: number | string;
  /** The comment node (for error reporting location) */
  comment: TSESTree.Comment;
}

const NUMERIC_TAG_NAMES = Object.keys(CONSTRAINT_TAG_DEFINITIONS).filter(
  (k) => CONSTRAINT_TAG_DEFINITIONS[k as keyof typeof CONSTRAINT_TAG_DEFINITIONS] === "number"
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
