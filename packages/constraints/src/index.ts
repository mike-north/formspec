/**
 * @formspec/constraints
 *
 * Constraint validation for FormSpec - restrict features based on target
 * environment capabilities.
 *
 * This package provides:
 * - Type definitions for constraint configuration
 * - YAML/TypeScript config file loading
 * - Core validation logic for FormSpec elements
 * - JSON Schema for .formspec.yml validation
 *
 * @example
 * ```ts
 * import { loadConfig, validateFormSpecElements } from '@formspec/constraints';
 * import { formspec, field } from '@formspec/dsl';
 *
 * // Load constraints from .formspec.yml
 * const { config } = await loadConfig();
 *
 * // Create a form
 * const form = formspec(
 *   field.text("name"),
 *   field.dynamicEnum("country", "countries"),
 * );
 *
 * // Validate against constraints
 * const result = validateFormSpecElements(form.elements, { constraints: config });
 *
 * if (!result.valid) {
 *   console.error('Validation failed:', result.issues);
 * }
 * ```
 *
 * @packageDocumentation
 */

// Types
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
  ConstraintConfig,
  ResolvedConstraintConfig,
  ResolvedUISchemaConstraints,
  ResolvedRuleConstraints,
  FormSpecConfig,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

// Config loading
export {
  loadConfig,
  loadConfigFromString,
  defineConstraints,
  type LoadConfigOptions,
  type LoadConfigResult,
} from "./loader.js";

// Defaults
export { DEFAULT_CONSTRAINTS, DEFAULT_CONFIG, mergeWithDefaults } from "./defaults.js";

// Validators
export {
  validateFormSpecElements,
  validateFormSpec,
  type FormSpecValidationOptions,
} from "./validators/formspec.js";

export {
  validateFieldTypes,
  isFieldTypeAllowed,
  getFieldTypeSeverity,
  type FieldTypeContext,
} from "./validators/field-types.js";

export {
  validateLayout,
  isLayoutTypeAllowed,
  isNestingDepthAllowed,
  type LayoutContext,
} from "./validators/layout.js";

export {
  validateFieldOptions,
  extractFieldOptions,
  isFieldOptionAllowed,
  getFieldOptionSeverity,
  type FieldOptionsContext,
  type FieldOption,
} from "./validators/field-options.js";
