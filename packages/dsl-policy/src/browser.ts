/**
 * Browser-safe exports from @formspec/dsl-policy.
 *
 * @packageDocumentation
 */

export type {
  Severity,
  FieldTypeConstraints,
  LayoutConstraints,
  LayoutTypeConstraints,
  RuleEffectConstraints,
  RuleConstraints,
  UISchemaConstraints,
  FieldOptionConstraints,
  ControlOptionConstraints,
  DSLPolicy,
  ResolvedDSLPolicy,
  ResolvedUISchemaConstraints,
  ResolvedRuleConstraints,
  FormSpecValidationOptions,
  FieldTypeContext,
  LayoutContext,
  FieldOptionsContext,
  FieldOption,
  ValidationIssue,
  ValidationResult,
} from "./types.js";
import type { ConstraintConfig, ResolvedConstraintConfig } from "./types.js";

// Deprecated names are re-exported intentionally for compatibility.
// eslint-disable-next-line @typescript-eslint/no-deprecated
export type { ConstraintConfig, ResolvedConstraintConfig };

export { DEFAULT_DSL_POLICY, defineDSLPolicy, mergeWithDefaults } from "./defaults.js";

// Deprecated names are re-exported intentionally for compatibility.
// eslint-disable-next-line @typescript-eslint/no-deprecated
export { DEFAULT_CONSTRAINTS, defineConstraints } from "./defaults.js";

export { validateFormSpecElements, validateFormSpec } from "./validators/formspec.js";

export {
  validateFieldTypes,
  isFieldTypeAllowed,
  getFieldTypeSeverity,
} from "./validators/field-types.js";

export { validateLayout, isLayoutTypeAllowed, isNestingDepthAllowed } from "./validators/layout.js";

export {
  validateFieldOptions,
  extractFieldOptions,
  isFieldOptionAllowed,
  getFieldOptionSeverity,
} from "./validators/field-options.js";
