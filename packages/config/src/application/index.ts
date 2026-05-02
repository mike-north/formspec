/**
 * Application/types-side responsibility area for @formspec/config.
 *
 * Concerns: what a resolved config means and how it is used. Defines the
 * `FormSpecConfig` type, `defineFormSpecConfig` helper, default values, and
 * DSL-policy interop types. Environment-agnostic and does not import from
 * Node's filesystem APIs.
 *
 * Consumers that already have a config object in hand only need exports from
 * this directory; they do not pay for the loader.
 *
 * Internal barrel for application-side exports.
 */
export {
  DEFAULT_CONFIG,
  DEFAULT_DSL_POLICY,
  defineDSLPolicy,
  mergeWithDefaults,
} from "./defaults.js";

// Deprecated names are re-exported intentionally for compatibility.
// eslint-disable-next-line @typescript-eslint/no-deprecated
export { DEFAULT_CONSTRAINTS, defineConstraints } from "./defaults.js";
export { defineFormSpecConfig } from "./define.js";
export * from "./policy.js";
export type {
  ControlOptionConstraints,
  DSLPolicy,
  FieldOption,
  FieldOptionConstraints,
  FieldOptionsContext,
  FieldTypeConstraints,
  FieldTypeContext,
  FormSpecConfig,
  FormSpecPackageOverride,
  FormSpecSerializationConfig,
  FormSpecValidationOptions,
  LayoutConstraints,
  LayoutContext,
  LayoutTypeConstraints,
  ResolvedDSLPolicy,
  ResolvedRuleConstraints,
  ResolvedUISchemaConstraints,
  RuleConstraints,
  RuleEffectConstraints,
  Severity,
  UISchemaConstraints,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

// Deprecated names are re-exported intentionally for compatibility.
// eslint-disable-next-line @typescript-eslint/no-deprecated
export type { ConstraintConfig, ResolvedConstraintConfig } from "./types.js";
