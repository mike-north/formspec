/**
 * Canonical set of FormSpec decorator names.
 *
 * This is the single source of truth for which decorators FormSpec recognizes.
 * Both `@formspec/eslint-plugin` and `@formspec/build` import from here.
 */

/** Names of all built-in FormSpec decorators. */
export const FORMSPEC_DECORATOR_NAMES = [
  "Field",
  "Group",
  "ShowWhen",
  "EnumOptions",
  "Minimum",
  "Maximum",
  "ExclusiveMinimum",
  "ExclusiveMaximum",
  "MinLength",
  "MaxLength",
  "Pattern",
] as const;

/** Type of a FormSpec decorator name. */
export type FormSpecDecoratorName = (typeof FORMSPEC_DECORATOR_NAMES)[number];

/**
 * Constraint decorator names that are valid as TSDoc tags, mapped to
 * their expected value type for parsing.
 *
 * Both `@formspec/build` (schema generation) and `@formspec/eslint-plugin`
 * (lint-time validation) import this to determine which JSDoc tags to
 * recognize and how to parse their values.
 */
export const CONSTRAINT_TAG_DEFINITIONS = {
  Minimum: "number",
  Maximum: "number",
  ExclusiveMinimum: "number",
  ExclusiveMaximum: "number",
  MinLength: "number",
  MaxLength: "number",
  Pattern: "string",
} as const;

/** Type of a constraint tag name. */
export type ConstraintTagName = keyof typeof CONSTRAINT_TAG_DEFINITIONS;
