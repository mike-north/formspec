/**
 * \@formspec/config
 *
 * Unified configuration for FormSpec: schemas, extensions, serialization,
 * metadata policy, and pipeline settings. This is the single entry point
 * authors and downstream tools use to describe how a project consumes
 * FormSpec.
 *
 * The package also currently hosts DSL-policy validation logic — the
 * building-block constraints (field-type, layout, rule-effect, etc.) that
 * narrow which authoring features a project may use. That responsibility
 * lives here by historical accident from the `@formspec/constraints` era
 * and is being factored into a private `@formspec/dsl-policy` package
 * (tracked in [#420](https://github.com/mike-north/formspec/issues/420)).
 *
 * "Constraint" is overloaded in FormSpec; see the data-vs-DSL constraint
 * taxonomy in `docs/000-principles.md` for the canonical distinction:
 *
 * - **Data constraints** narrow valid values of a field (TSDoc tags such
 *   as `@minimum`, IR `ConstraintNode`, JSON Schema validation keywords).
 * - **DSL policy** narrows which FormSpec features a project may author
 *   (composed from `FieldTypeConstraints`, `LayoutConstraints`, etc.,
 *   loaded from `FormSpecConfig` and enforced at lint/build time).
 *
 * @example
 * ```ts
 * import { loadFormSpecConfig, validateFormSpecElements } from '@formspec/config';
 * import { formspec, field } from '@formspec/dsl';
 *
 * // Load configuration from formspec.config.ts
 * const result = await loadFormSpecConfig();
 * if (!result.found) {
 *   throw new Error('No formspec.config.ts found');
 * }
 *
 * // Create a form
 * const form = formspec(
 *   field.text("name"),
 *   field.dynamicEnum("country", "countries"),
 * );
 *
 * // Validate against the configured DSL policy
 * const validation = validateFormSpecElements(form.elements, { constraints: result.config });
 *
 * if (!validation.valid) {
 *   console.error('Validation failed:', validation.issues);
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
  FormSpecPackageOverride,
  ValidationIssue,
  ValidationResult,
} from "./types.js";
export type {
  AnyField,
  ArrayField,
  BooleanField,
  Conditional,
  DynamicEnumField,
  DynamicSchemaField,
  EnumOption,
  EnumOptionValue,
  FormElement,
  FormSpec,
  Group,
  NumberField,
  ObjectField,
  StaticEnumField,
  TextField,
} from "@formspec/core";

// Logger contract (re-exported so LoadConfigOptions.logger resolves in the API surface)
export type { LoggerLike } from "@formspec/core";

// Config loading
export {
  loadFormSpecConfig,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- backward-compatible re-export
  loadConfig,
  defineConstraints,
  type LoadConfigOptions,
  type LoadConfigResult,
  type LoadConfigFoundResult,
  type LoadConfigNotFoundResult,
} from "./loader.js";

// Config factory + resolution
export { defineFormSpecConfig } from "./define.js";
export { resolveConfigForFile, type ResolvedFormSpecConfig } from "./resolve.js";

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
