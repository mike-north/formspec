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
 *
 * @internal
 */
export const _BUILTIN_CONSTRAINT_DEFINITIONS = {
  minimum: "number",
  maximum: "number",
  exclusiveMinimum: "number",
  exclusiveMaximum: "number",
  multipleOf: "number",
  minLength: "number",
  maxLength: "number",
  minItems: "number",
  maxItems: "number",
  uniqueItems: "boolean",
  pattern: "string",
  const: "json",
  enumOptions: "json",
} as const;

/**
 * Type of a built-in constraint name.
 *
 * @internal
 */
export type BuiltinConstraintName =
  | "minimum"
  | "maximum"
  | "exclusiveMinimum"
  | "exclusiveMaximum"
  | "multipleOf"
  | "minLength"
  | "maxLength"
  | "minItems"
  | "maxItems"
  | "uniqueItems"
  | "pattern"
  | "const"
  | "enumOptions";

/**
 * Normalizes a constraint tag name from PascalCase to camelCase.
 *
 * Lowercases the first character so that e.g. `"Minimum"` becomes `"minimum"`.
 * Callers must strip the `@` prefix before calling this function.
 *
 * @example
 * normalizeConstraintTagName("Minimum")   // "minimum"
 * normalizeConstraintTagName("MinLength") // "minLength"
 * normalizeConstraintTagName("minimum")   // "minimum" (idempotent)
 *
 * @internal
 */
export function _normalizeConstraintTagName(tagName: string): string {
  return tagName.charAt(0).toLowerCase() + tagName.slice(1);
}

/**
 * Type guard: checks whether a tag name is a known built-in constraint.
 *
 * Uses `Object.hasOwn()` rather than `in` to prevent prototype-chain
 * matches on names like `"toString"` or `"constructor"`.
 *
 * Callers should normalize with {@link _normalizeConstraintTagName} first
 * if the input may be PascalCase.
 *
 * @internal
 */
export function _isBuiltinConstraintName(tagName: string): tagName is BuiltinConstraintName {
  return Object.hasOwn(_BUILTIN_CONSTRAINT_DEFINITIONS, tagName);
}
