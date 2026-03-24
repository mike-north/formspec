/**
 * TSDoc comment tag extractor.
 *
 * Extracts constraint and annotation tags from JSDoc/TSDoc comments
 * on class members. These are applied as JSON Schema constraints
 * alongside decorator-based constraints.
 */

import * as ts from "typescript";

/**
 * Extracted comment tag information.
 */
export interface CommentTagInfo {
  /** Tag name without @ prefix (e.g., "minimum", "displayName") */
  tagName: string;
  /** Parsed value (number, string, boolean, or undefined for bare tags) */
  value: number | string | boolean | undefined;
}

/**
 * Extracts constraint and annotation tags from JSDoc comments on a node.
 *
 * Supported constraint tags (prefix with `@` in JSDoc):
 * - `minimum` — JSON Schema minimum
 * - `maximum` — JSON Schema maximum
 * - `exclusiveMinimum` — JSON Schema exclusiveMinimum
 * - `exclusiveMaximum` — JSON Schema exclusiveMaximum
 * - `multipleOf` — JSON Schema multipleOf
 * - `minLength` — JSON Schema minLength
 * - `maxLength` — JSON Schema maxLength
 * - `pattern` — JSON Schema pattern
 * - `minItems` — JSON Schema minItems
 * - `maxItems` — JSON Schema maxItems
 * - `uniqueItems` — JSON Schema uniqueItems (bare tag, no value)
 * - `const` — JSON Schema const
 * - `maxSigFig` — Maximum significant figures (positive integer)
 * - `maxDecimalPlaces` — Maximum decimal places (non-negative integer)
 *
 * Supported annotation tags:
 * - `displayName` — Maps to JSON Schema title
 * - `description` — Maps to JSON Schema description
 * - `defaultValue` — Maps to JSON Schema default
 * - `deprecated` — Maps to JSON Schema deprecated: true (bare tag)
 * - `format` — JSON Schema format (e.g., "email", "date", "uri")
 * - `placeholder` — UI placeholder text
 * - `group` — UI group name
 * - `order` — UI display order (non-negative integer)
 *
 * Supported condition tags:
 * - `showWhen` — Raw condition text (e.g., "paymentMethod card")
 * - `hideWhen` — Raw condition text (e.g., "premium true")
 */
export function extractCommentTags(node: ts.Node): CommentTagInfo[] {
  const tags: CommentTagInfo[] = [];
  const jsdocTags = ts.getJSDocTags(node);

  for (const tag of jsdocTags) {
    const tagName = tag.tagName.text;
    const comment = getTagComment(tag);

    const parsed = parseTag(tagName, comment);
    if (parsed !== null) {
      tags.push(parsed);
    }
  }

  return tags;
}

/** Numeric constraint tags that take a number value. */
const NUMERIC_TAGS = new Set([
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
]);

/** Integer constraint tags (non-negative). */
const INTEGER_TAGS = new Set([
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "order",
  "maxDecimalPlaces",
]);

/** Positive integer constraint tags (value must be >= 1). */
const POSITIVE_INTEGER_TAGS = new Set([
  "maxSigFig",
]);

/** Bare tags (no value). */
const BARE_TAGS = new Set([
  "uniqueItems",
  "deprecated",
]);

/** Text annotation tags. */
const TEXT_TAGS = new Set([
  "displayName",
  "description",
  "format",
  "placeholder",
  "group",
]);

/** Condition tags — raw text preserved as-is. */
const CONDITION_TAGS = new Set([
  "showWhen",
  "hideWhen",
]);

function getTagComment(tag: ts.JSDocTag): string | undefined {
  if (typeof tag.comment === "string") {
    return tag.comment.trim();
  }
  if (Array.isArray(tag.comment)) {
    // JSDocComment is an array of JSDocText | JSDocLink | JSDocLinkCode | JSDocLinkPlain.
    // Only collect JSDocText nodes (those with kind === SyntaxKind.JSDocText).
    const parts = tag.comment as ts.NodeArray<ts.JSDocComment>;
    return parts
      .filter((part): part is ts.JSDocText => part.kind === ts.SyntaxKind.JSDocText)
      .map((part) => part.text)
      .join("")
      .trim();
  }
  return undefined;
}

function parseTag(tagName: string, comment: string | undefined): CommentTagInfo | null {
  if (NUMERIC_TAGS.has(tagName)) {
    if (comment === undefined || comment === "") return null;
    const num = Number(comment);
    if (!Number.isFinite(num)) return null;
    return { tagName, value: num };
  }

  if (INTEGER_TAGS.has(tagName)) {
    if (comment === undefined || comment === "") return null;
    const num = Number(comment);
    if (!Number.isInteger(num) || num < 0) return null;
    return { tagName, value: num };
  }

  if (POSITIVE_INTEGER_TAGS.has(tagName)) {
    if (comment === undefined || comment === "") return null;
    const num = Number(comment);
    if (!Number.isInteger(num) || num < 1) return null;
    return { tagName, value: num };
  }

  if (CONDITION_TAGS.has(tagName)) {
    if (comment === undefined || comment === "") return null;
    return { tagName, value: comment };
  }

  if (BARE_TAGS.has(tagName)) {
    return { tagName, value: undefined };
  }

  if (TEXT_TAGS.has(tagName)) {
    if (comment === undefined || comment === "") return null;
    return { tagName, value: comment };
  }

  if (tagName === "pattern") {
    if (comment === undefined || comment === "") return null;
    // Validate it's a valid regex
    try {
      new RegExp(comment);
    } catch {
      return null;
    }
    return { tagName, value: comment };
  }

  if (tagName === "const") {
    if (comment === undefined || comment === "") return null;
    // Try JSON.parse first, fallback to string
    try {
      const parsed: unknown = JSON.parse(comment);
      if (
        typeof parsed === "number" ||
        typeof parsed === "string" ||
        typeof parsed === "boolean"
      ) {
        return { tagName, value: parsed };
      }
      // For complex JSON, store as string representation
      return { tagName, value: comment };
    } catch {
      return { tagName, value: comment };
    }
  }

  if (tagName === "defaultValue") {
    if (comment === undefined || comment === "") return null;
    // Try JSON.parse first, fallback to string
    try {
      const parsed: unknown = JSON.parse(comment);
      if (
        typeof parsed === "number" ||
        typeof parsed === "string" ||
        typeof parsed === "boolean"
      ) {
        return { tagName, value: parsed };
      }
      return { tagName, value: comment };
    } catch {
      return { tagName, value: comment };
    }
  }

  // Unknown tag — ignore
  return null;
}
