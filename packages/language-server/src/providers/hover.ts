/**
 * Hover provider for FormSpec JSDoc constraint tags.
 *
 * Returns Markdown documentation for a recognized FormSpec JSDoc tag when
 * the cursor is positioned over it. This is a skeleton — precise token
 * detection within JSDoc comment ranges will be added in a future phase.
 */

import {
  normalizeConstraintTagName,
  isBuiltinConstraintName,
  type BuiltinConstraintName,
} from "@formspec/core";
import type { Hover } from "vscode-languageserver/node.js";

/**
 * Markdown documentation for each built-in FormSpec constraint tag.
 *
 * Keys are the canonical constraint names from `BUILTIN_CONSTRAINT_DEFINITIONS`.
 * Values are Markdown strings suitable for LSP hover responses.
 */
const CONSTRAINT_HOVER_DOCS: Record<BuiltinConstraintName, string> = {
  minimum: [
    "**@minimum** `<number>`",
    "",
    "Sets an inclusive lower bound on a numeric field.",
    "",
    "Maps to `minimum` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    "/** @minimum 0 */",
    "amount: number;",
    "```",
  ].join("\n"),

  maximum: [
    "**@maximum** `<number>`",
    "",
    "Sets an inclusive upper bound on a numeric field.",
    "",
    "Maps to `maximum` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    "/** @maximum 100 */",
    "percentage: number;",
    "```",
  ].join("\n"),

  exclusiveMinimum: [
    "**@exclusiveMinimum** `<number>`",
    "",
    "Sets an exclusive lower bound on a numeric field.",
    "",
    "Maps to `exclusiveMinimum` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    "/** @exclusiveMinimum 0 */",
    "positiveAmount: number;",
    "```",
  ].join("\n"),

  exclusiveMaximum: [
    "**@exclusiveMaximum** `<number>`",
    "",
    "Sets an exclusive upper bound on a numeric field.",
    "",
    "Maps to `exclusiveMaximum` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    "/** @exclusiveMaximum 1 */",
    "ratio: number;",
    "```",
  ].join("\n"),

  multipleOf: [
    "**@multipleOf** `<number>`",
    "",
    "Requires the numeric value to be a multiple of the given number.",
    "",
    "Maps to `multipleOf` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    "/** @multipleOf 0.01 */",
    "price: number;",
    "```",
  ].join("\n"),

  minLength: [
    "**@minLength** `<number>`",
    "",
    "Sets a minimum character length on a string field.",
    "",
    "Maps to `minLength` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    "/** @minLength 1 */",
    "name: string;",
    "```",
  ].join("\n"),

  maxLength: [
    "**@maxLength** `<number>`",
    "",
    "Sets a maximum character length on a string field.",
    "",
    "Maps to `maxLength` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    "/** @maxLength 255 */",
    "description: string;",
    "```",
  ].join("\n"),

  minItems: [
    "**@minItems** `<number>`",
    "",
    "Sets a minimum number of items in an array field.",
    "",
    "Maps to `minItems` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    "/** @minItems 1 */",
    "tags: string[];",
    "```",
  ].join("\n"),

  maxItems: [
    "**@maxItems** `<number>`",
    "",
    "Sets a maximum number of items in an array field.",
    "",
    "Maps to `maxItems` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    "/** @maxItems 10 */",
    "tags: string[];",
    "```",
  ].join("\n"),

  pattern: [
    "**@pattern** `<regex>`",
    "",
    "Sets a regular expression pattern that a string field must match.",
    "",
    "Maps to `pattern` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    "/** @pattern ^[a-z0-9]+$ */",
    "slug: string;",
    "```",
  ].join("\n"),

  enumOptions: [
    "**@enumOptions** `<json-array>`",
    "",
    "Specifies the allowed values for an enum field as an inline JSON array.",
    "",
    "Maps to `enum` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    '/** @enumOptions ["draft","sent","archived"] */',
    "status: string;",
    "```",
  ].join("\n"),
} satisfies Record<BuiltinConstraintName, string>;

/**
 * Returns hover documentation for a FormSpec JSDoc tag name.
 *
 * Accepts both camelCase (`"minimum"`) and PascalCase (`"Minimum"`) forms.
 * The `@` prefix is stripped before lookup if present.
 * Returns `null` when the tag is not a recognized FormSpec constraint tag.
 *
 * @param tagName - The tag name to look up (e.g., `"minimum"`, `"@pattern"`)
 * @returns An LSP `Hover` response, or `null` if the tag is not recognized
 */
export function getHoverForTag(tagName: string): Hover | null {
  // Strip leading `@` prefix if present
  const raw = tagName.startsWith("@") ? tagName.slice(1) : tagName;
  const name = normalizeConstraintTagName(raw);

  if (!isBuiltinConstraintName(name)) {
    return null;
  }

  return {
    contents: {
      kind: "markdown",
      value: CONSTRAINT_HOVER_DOCS[name],
    },
  };
}
