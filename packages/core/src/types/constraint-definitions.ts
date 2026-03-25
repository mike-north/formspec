/**
 * Built-in constraint definitions for FormSpec constraint validation.
 *
 * This is the single source of truth for which constraints FormSpec
 * recognizes. Both `@formspec/build` (schema generation)
 * and `@formspec/eslint-plugin` (lint-time validation) import from here.
 */

/**
 * Built-in constraint names mapped to their expected value type for parsing.
 * Constraints are surface-agnostic — they manifest as both TSDoc tags
 * (e.g., `@minimum 0`) and chain DSL options (e.g., `{ minimum: 0 }`).
 *
 * Keys use camelCase matching JSON Schema property names.
 */
export const BUILTIN_CONSTRAINT_DEFINITIONS = {
  minimum: "number",
  maximum: "number",
  exclusiveMinimum: "number",
  exclusiveMaximum: "number",
  multipleOf: "number",
  minLength: "number",
  maxLength: "number",
  minItems: "number",
  maxItems: "number",
  pattern: "string",
  enumOptions: "json",
} as const;

/** Type of a built-in constraint name. */
export type BuiltinConstraintName = keyof typeof BUILTIN_CONSTRAINT_DEFINITIONS;

/**
 * Normalizes a constraint tag name to camelCase.
 *
 * Allows users to write either `@Minimum` or `@minimum` — both are
 * normalized to the camelCase canonical form `"minimum"` used as keys
 * in {@link BUILTIN_CONSTRAINT_DEFINITIONS}.
 */
export function normalizeConstraintTagName(tagName: string): string {
  return tagName.charAt(0).toLowerCase() + tagName.slice(1);
}

/**
 * Type guard: checks whether a tag name is a known built-in constraint.
 *
 * Callers should normalize with {@link normalizeConstraintTagName} first
 * if the input may be PascalCase.
 */
export function isBuiltinConstraintName(tagName: string): tagName is BuiltinConstraintName {
  return tagName in BUILTIN_CONSTRAINT_DEFINITIONS;
}
