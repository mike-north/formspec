/**
 * Browser-safe exports from @formspec/config.
 *
 * This entry point excludes the file-based config loader (loadFormSpecConfig)
 * which requires Node.js APIs. Use this entry point for browser builds.
 *
 * For browser use:
 * - Use loadConfigFromString() to parse embedded YAML config strings
 * - Use defineDSLPolicy() for programmatic DSL-policy configuration
 * - Use validateFormSpec() for validation
 *
 * @packageDocumentation
 */

import type { FormElement, FormSpec } from "@formspec/core";
import {
  extractFieldOptions as extractInternalFieldOptions,
  getFieldOptionSeverity as getInternalFieldOptionSeverity,
  getFieldTypeSeverity as getInternalFieldTypeSeverity,
  isFieldOptionAllowed as isInternalFieldOptionAllowed,
  isFieldTypeAllowed as isInternalFieldTypeAllowed,
  isLayoutTypeAllowed as isInternalLayoutTypeAllowed,
  isNestingDepthAllowed as isInternalNestingDepthAllowed,
  validateFieldOptions as validateInternalFieldOptions,
  validateFieldTypes as validateInternalFieldTypes,
  validateFormSpec as validateInternalFormSpec,
  validateFormSpecElements as validateInternalFormSpecElements,
  validateLayout as validateInternalLayout,
} from "@formspec/dsl-policy/browser";
import { parse as parseYaml } from "yaml";
import {
  DEFAULT_CONFIG,
  DEFAULT_CONSTRAINTS,
  DEFAULT_DSL_POLICY,
  defineConstraints,
  defineDSLPolicy,
  mergeWithDefaults,
} from "./defaults.js";
import type {
  ControlOptionConstraints,
  DSLPolicy,
  FieldOption,
  FieldOptionConstraints,
  FieldOptionsContext,
  FieldTypeConstraints,
  FieldTypeContext,
  FormSpecConfig,
  FormSpecPackageOverride,
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
import type { ConstraintConfig, ResolvedConstraintConfig } from "./types.js";

// Re-export browser-safe types.
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
};

// Deprecated names are re-exported intentionally for compatibility.
// eslint-disable-next-line @typescript-eslint/no-deprecated
export type { ConstraintConfig, ResolvedConstraintConfig };

// Re-export defaults and factories with local public types.
export { DEFAULT_CONFIG, DEFAULT_DSL_POLICY, defineDSLPolicy, mergeWithDefaults };

// Deprecated names are re-exported intentionally for compatibility.
// eslint-disable-next-line @typescript-eslint/no-deprecated
export { DEFAULT_CONSTRAINTS, defineConstraints };

/**
 * Synchronously loads DSL-policy config from a pre-parsed YAML string.
 * Useful for browser environments or when config is already available.
 *
 * @param yamlContent - The YAML content to parse
 * @returns The parsed and merged DSL policy
 *
 * @beta
 */
export function loadConfigFromString(yamlContent: string): ResolvedDSLPolicy {
  const parsed = parseYaml(yamlContent) as FormSpecConfig | null | undefined;

  if (parsed === null || parsed === undefined) {
    return mergeWithDefaults(undefined);
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid config content: expected an object, got ${typeof parsed}`);
  }

  return mergeWithDefaults(parsed.constraints);
}

/**
 * Validates FormSpec elements against DSL policy.
 *
 * @beta
 */
export function validateFormSpecElements(
  elements: readonly FormElement[],
  options: FormSpecValidationOptions = {}
): ValidationResult {
  return validateInternalFormSpecElements(elements, options);
}

/**
 * Validates a complete FormSpec against DSL policy.
 *
 * @beta
 */
export function validateFormSpec(
  formSpec: FormSpec<readonly FormElement[]>,
  options: FormSpecValidationOptions = {}
): ValidationResult {
  return validateInternalFormSpec(formSpec, options);
}

/**
 * Validates a field type against DSL-policy constraints.
 *
 * @beta
 */
export function validateFieldTypes(
  context: FieldTypeContext,
  constraints: FieldTypeConstraints
): ValidationIssue[] {
  return validateInternalFieldTypes(context, constraints);
}

/**
 * Checks whether a field type is allowed by DSL-policy constraints.
 *
 * @beta
 */
export function isFieldTypeAllowed(fieldType: string, constraints: FieldTypeConstraints): boolean {
  return isInternalFieldTypeAllowed(fieldType, constraints);
}

/**
 * Gets the DSL-policy severity for a field type.
 *
 * @beta
 */
export function getFieldTypeSeverity(
  fieldType: string,
  constraints: FieldTypeConstraints
): Severity {
  return getInternalFieldTypeSeverity(fieldType, constraints);
}

/**
 * Validates a layout construct against DSL-policy constraints.
 *
 * @beta
 */
export function validateLayout(
  context: LayoutContext,
  constraints: LayoutConstraints
): ValidationIssue[] {
  return validateInternalLayout(context, constraints);
}

/**
 * Checks whether a layout construct is allowed by DSL-policy constraints.
 *
 * @beta
 */
export function isLayoutTypeAllowed(
  layoutType: "group" | "conditional",
  constraints: LayoutConstraints
): boolean {
  return isInternalLayoutTypeAllowed(layoutType, constraints);
}

/**
 * Checks whether a nesting depth is allowed by DSL-policy constraints.
 *
 * @beta
 */
export function isNestingDepthAllowed(depth: number, constraints: LayoutConstraints): boolean {
  return isInternalNestingDepthAllowed(depth, constraints);
}

/**
 * Validates field options against DSL-policy constraints.
 *
 * @beta
 */
export function validateFieldOptions(
  context: FieldOptionsContext,
  constraints: FieldOptionConstraints
): ValidationIssue[] {
  return validateInternalFieldOptions(context, constraints);
}

/**
 * Extracts which field options are present on a field-like object.
 *
 * @beta
 */
export function extractFieldOptions(field: Record<string, unknown>): FieldOption[] {
  return extractInternalFieldOptions(field);
}

/**
 * Checks whether a field option is allowed by DSL-policy constraints.
 *
 * @beta
 */
export function isFieldOptionAllowed(
  option: FieldOption,
  constraints: FieldOptionConstraints
): boolean {
  return isInternalFieldOptionAllowed(option, constraints);
}

/**
 * Gets the DSL-policy severity for a field option.
 *
 * @beta
 */
export function getFieldOptionSeverity(
  option: FieldOption,
  constraints: FieldOptionConstraints
): Severity {
  return getInternalFieldOptionSeverity(option, constraints);
}
