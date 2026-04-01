/**
 * Utility functions for extracting constraints from JSDoc comments.
 */

import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import type { SourceCode } from "@typescript-eslint/utils/ts-eslint";
import {
  BUILTIN_CONSTRAINT_DEFINITIONS,
  normalizeConstraintTagName,
} from "@formspec/core/internals";

/** A constraint extracted from a JSDoc comment tag. */
export interface JSDocConstraint {
  /** The constraint name (e.g., "minimum", "maximum") */
  name: string;
  /** The parsed value */
  value: number | string;
  /** The comment node (for error reporting location) */
  comment: TSESTree.Comment;
}

const NUMERIC_TAG_NAMES = Object.keys(BUILTIN_CONSTRAINT_DEFINITIONS).filter(
  (k) =>
    BUILTIN_CONSTRAINT_DEFINITIONS[k as keyof typeof BUILTIN_CONSTRAINT_DEFINITIONS] === "number"
);

// Build alternation that matches both PascalCase (@Minimum) and camelCase (@minimum)
// by including the uppercased-first-letter variant for each camelCase tag name.
const NUMERIC_TAGS_PATTERN = NUMERIC_TAG_NAMES.map(
  (name) => `${name}|${name.charAt(0).toUpperCase()}${name.slice(1)}`
).join("|");

// Numeric tags: value stops at the next `@` tag, `*/`, or end-of-line.
// Skip path-targeted constraints (@minimum :value 0) — the leading
// `:identifier` prefix indicates a sub-property target.
const NUMERIC_TAG_REGEX = new RegExp(
  `@(${NUMERIC_TAGS_PATTERN})\\s+(?!:\\w+\\s)(.+?)(?=\\s*@|\\s*\\*\\/|\\s*$)`,
  "gm"
);

// Pattern tag: value captures everything until `*/` or end-of-line,
// because regex patterns can contain `@` (e.g., email validation).
// Skip path-targeted constraints (@pattern :field value) — the leading
// `:identifier` prefix indicates a sub-property target, not a regex pattern.
const PATTERN_TAG_REGEX = /@[Pp]attern\s+(?!:\w+\s)(.+?)(?=\s*\*\/|\s*$)/gm;

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
      const rawName = match[1];
      const rawValue = match[2];
      if (!rawName || !rawValue) continue;
      // Normalize PascalCase → camelCase canonical form
      const name = normalizeConstraintTagName(rawName);

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
      results.push({ name: "pattern", value: cleanedValue, comment });
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

/** A raw JSDoc tag occurrence — name + raw string value + comment node. */
export interface RawJSDocTag {
  /** The tag name (without the `@` prefix). */
  name: string;
  /** The raw string value that follows the tag name (trimmed). */
  value: string;
  /** The comment node (for error reporting location). */
  comment: TSESTree.Comment;
}

/**
 * Extracts all occurrences of a specific JSDoc tag from the comments
 * preceding a node, returning the raw string value of each occurrence.
 *
 * Unlike `getJSDocConstraints`, this function is not limited to the
 * registered FormSpec constraint tag names and does not attempt to
 * parse the value as a number. The value is everything between the
 * tag name and the next `*\/` or end-of-line.
 *
 * Intentionally does NOT stop at `@` characters in the value, because
 * custom tag values can contain `@` (e.g., regex patterns like
 * `[^@]+@[^@]+` for email validation).
 *
 * This is used by `createConstraintRule` to support custom/extension tags.
 *
 * @param tagName - The tag name to look for (without the `@` prefix)
 * @param node - The AST node to check for preceding JSDoc comments
 * @param sourceCode - The ESLint source code object
 * @returns Array of raw tag occurrences
 */
export function getArbitraryJSDocTag(
  tagName: string,
  node: TSESTree.Node,
  sourceCode: SourceCode
): RawJSDocTag[] {
  // Collect comments before the node itself
  const comments = [...sourceCode.getCommentsBefore(node)];

  // For PropertyDefinition with decorators, also collect comments before the
  // property key — JSDoc comments placed between decorators and the property
  // name are not "before" the PropertyDefinition node.
  if (node.type === AST_NODE_TYPES.PropertyDefinition && node.decorators.length > 0) {
    const keyComments = sourceCode.getCommentsBefore(node.key);
    for (const c of keyComments) {
      if (!comments.includes(c)) {
        comments.push(c);
      }
    }
  }

  const results: RawJSDocTag[] = [];

  // Build a per-call regex to avoid shared mutable `lastIndex` state.
  // Escape the tag name to handle special regex characters (e.g., `.`, `$`).
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagRegex = new RegExp(`@(${escapedTag})(?:\\s+(.+?))?(?=\\s*\\*\\/|\\s*$)`, "gm");

  for (const comment of comments) {
    // Only process JSDoc-style block comments (/** ... */)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- TSESTree.Comment uses "Block"/"Line" strings, not AST_NODE_TYPES enum
    if (comment.type !== "Block" || !comment.value.startsWith("*")) {
      continue;
    }

    tagRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(comment.value)) !== null) {
      const matchedName = match[1];
      const rawValue = match[2] ?? "";
      if (!matchedName) continue;

      const cleanedValue = rawValue.replace(/^\s*\*\s*/gm, "").trim();
      results.push({ name: matchedName, value: cleanedValue, comment });
    }
  }

  return results;
}
