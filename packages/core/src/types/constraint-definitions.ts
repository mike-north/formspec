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
 * (e.g., `@Minimum 0`) and chain DSL options (e.g., `{ minimum: 0 }`).
 */
export const BUILTIN_CONSTRAINT_DEFINITIONS = {
  Minimum: "number",
  Maximum: "number",
  ExclusiveMinimum: "number",
  ExclusiveMaximum: "number",
  MinLength: "number",
  MaxLength: "number",
  Pattern: "string",
  EnumOptions: "json",
} as const;

/** Type of a built-in constraint name. */
export type BuiltinConstraintName = keyof typeof BUILTIN_CONSTRAINT_DEFINITIONS;
