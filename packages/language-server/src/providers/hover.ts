/**
 * Hover provider for FormSpec JSDoc constraint tags.
 *
 * Returns Markdown documentation for a recognized FormSpec JSDoc tag when
 * the cursor is positioned over it. This is a skeleton — precise token
 * detection within JSDoc comment ranges will be added in a future phase.
 */

import { BUILTIN_CONSTRAINT_DEFINITIONS, type BuiltinConstraintName } from "@formspec/core";
import type { Hover } from "vscode-languageserver/node.js";

/**
 * Markdown documentation for each built-in FormSpec constraint tag.
 *
 * Keys are the canonical constraint names from `BUILTIN_CONSTRAINT_DEFINITIONS`.
 * Values are Markdown strings suitable for LSP hover responses.
 */
const CONSTRAINT_HOVER_DOCS: Record<BuiltinConstraintName, string> = {
  Minimum: [
    "**@Minimum** `<number>`",
    "",
    "Sets an inclusive lower bound on a numeric field.",
    "",
    "Maps to `minimum` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    "/** @Minimum 0 */",
    "amount: number;",
    "```",
  ].join("\n"),

  Maximum: [
    "**@Maximum** `<number>`",
    "",
    "Sets an inclusive upper bound on a numeric field.",
    "",
    "Maps to `maximum` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    "/** @Maximum 100 */",
    "percentage: number;",
    "```",
  ].join("\n"),

  ExclusiveMinimum: [
    "**@ExclusiveMinimum** `<number>`",
    "",
    "Sets an exclusive lower bound on a numeric field.",
    "",
    "Maps to `exclusiveMinimum` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    "/** @ExclusiveMinimum 0 */",
    "positiveAmount: number;",
    "```",
  ].join("\n"),

  ExclusiveMaximum: [
    "**@ExclusiveMaximum** `<number>`",
    "",
    "Sets an exclusive upper bound on a numeric field.",
    "",
    "Maps to `exclusiveMaximum` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    "/** @ExclusiveMaximum 1 */",
    "ratio: number;",
    "```",
  ].join("\n"),

  MinLength: [
    "**@MinLength** `<number>`",
    "",
    "Sets a minimum character length on a string field.",
    "",
    "Maps to `minLength` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    "/** @MinLength 1 */",
    "name: string;",
    "```",
  ].join("\n"),

  MaxLength: [
    "**@MaxLength** `<number>`",
    "",
    "Sets a maximum character length on a string field.",
    "",
    "Maps to `maxLength` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    "/** @MaxLength 255 */",
    "description: string;",
    "```",
  ].join("\n"),

  Pattern: [
    "**@Pattern** `<regex>`",
    "",
    "Sets a regular expression pattern that a string field must match.",
    "",
    "Maps to `pattern` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    "/** @Pattern ^[a-z0-9]+$ */",
    "slug: string;",
    "```",
  ].join("\n"),

  EnumOptions: [
    "**@EnumOptions** `<json-array>`",
    "",
    "Specifies the allowed values for an enum field as an inline JSON array.",
    "",
    "Maps to `enum` in JSON Schema.",
    "",
    "**Example:**",
    "```typescript",
    '/** @EnumOptions ["draft","sent","archived"] */',
    "status: string;",
    "```",
  ].join("\n"),
} satisfies Record<BuiltinConstraintName, string>;

/**
 * Checks whether a given string is a recognized built-in constraint name.
 *
 * @param name - The name to check
 * @returns `true` if `name` is a `BuiltinConstraintName`
 */
function isBuiltinConstraintName(name: string): name is BuiltinConstraintName {
  return Object.prototype.hasOwnProperty.call(BUILTIN_CONSTRAINT_DEFINITIONS, name);
}

/**
 * Returns hover documentation for a FormSpec JSDoc tag name.
 *
 * The tag name lookup is case-sensitive and matches the canonical casing used
 * in `BUILTIN_CONSTRAINT_DEFINITIONS` (e.g., `"Minimum"`, `"Pattern"`).
 * The `@` prefix is stripped before lookup if present.
 * Returns `null` when the tag is not a recognized FormSpec constraint tag.
 *
 * @param tagName - The tag name to look up (e.g., `"Minimum"`, `"@Pattern"`)
 * @returns An LSP `Hover` response, or `null` if the tag is not recognized
 */
export function getHoverForTag(tagName: string): Hover | null {
  // Strip leading `@` prefix if present
  const name = tagName.startsWith("@") ? tagName.slice(1) : tagName;

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
