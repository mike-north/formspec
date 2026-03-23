/**
 * Constraint tag definitions for JSDoc-based constraint validation.
 *
 * This is the single source of truth for which JSDoc tags FormSpec
 * recognizes as constraints. Both `@formspec/build` (schema generation)
 * and `@formspec/eslint-plugin` (lint-time validation) import from here.
 */

/**
 * Constraint tag names valid as JSDoc tags, mapped to their expected
 * value type for parsing.
 */
export const CONSTRAINT_TAG_DEFINITIONS = {
  Minimum: "number",
  Maximum: "number",
  ExclusiveMinimum: "number",
  ExclusiveMaximum: "number",
  MinLength: "number",
  MaxLength: "number",
  Pattern: "string",
  EnumOptions: "json",
} as const;

/** Type of a constraint tag name. */
export type ConstraintTagName = keyof typeof CONSTRAINT_TAG_DEFINITIONS;
