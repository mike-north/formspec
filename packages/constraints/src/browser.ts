/**
 * Browser-safe exports from @formspec/constraints.
 *
 * This entry point excludes the file-based config loader (loadConfig)
 * which requires Node.js APIs. Use this entry point for browser builds.
 *
 * For browser use:
 * - Use loadConfigFromString() to parse YAML config strings
 * - Use defineConstraints() for programmatic configuration
 * - Use validateFormSpec() for validation
 *
 * @packageDocumentation
 */

// Re-export types
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

// Re-export browser-safe loader functions
// These are defined inline to avoid pulling in Node.js imports from loader.ts
import { parse as parseYaml } from "yaml";
import type { FormSpecConfig, ConstraintConfig, ResolvedConstraintConfig } from "./types.js";
import { mergeWithDefaults, DEFAULT_CONSTRAINTS, DEFAULT_CONFIG } from "./defaults.js";

// Re-export defaults
export { DEFAULT_CONSTRAINTS, DEFAULT_CONFIG, mergeWithDefaults };

/**
 * Synchronously loads config from a pre-parsed YAML string.
 * Useful for browser environments or when config is already available.
 *
 * @param yamlContent - The YAML content to parse
 * @returns The parsed and merged configuration
 */
export function loadConfigFromString(
  yamlContent: string
): ResolvedConstraintConfig {
  const parsed = parseYaml(yamlContent) as FormSpecConfig | null | undefined;

  if (parsed === null || parsed === undefined) {
    return mergeWithDefaults(undefined);
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `Invalid config content: expected an object, got ${typeof parsed}`
    );
  }

  return mergeWithDefaults(parsed.constraints);
}

/**
 * Creates a constraint configuration directly from an object.
 * Useful for programmatic configuration without YAML.
 *
 * @param config - Partial constraint configuration
 * @returns Complete configuration with defaults applied
 *
 * @example
 * ```ts
 * const config = defineConstraints({
 *   fieldTypes: {
 *     dynamicEnum: 'error',
 *     dynamicSchema: 'error',
 *   },
 *   layout: {
 *     group: 'error',
 *   },
 * });
 * ```
 */
export function defineConstraints(
  config: ConstraintConfig
): ResolvedConstraintConfig {
  return mergeWithDefaults(config);
}

// Re-export validators (these are all browser-safe)
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
