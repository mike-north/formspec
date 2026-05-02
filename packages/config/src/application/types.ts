/**
 * Severity level for DSL-policy violations.
 * - "error": Violation fails validation
 * - "warn": Violation emits warning but passes
 * - "off": Feature is allowed (no violation)
 *
 * @public
 */
export type Severity = "error" | "warn" | "off";

/**
 * Field type constraints - control which field types are allowed.
 * Fine-grained control over each DSL field builder.
 *
 * @public
 */
export interface FieldTypeConstraints {
  /** field.text() - basic text input */
  text?: Severity;
  /** field.number() - numeric input */
  number?: Severity;
  /** field.boolean() - checkbox/toggle */
  boolean?: Severity;
  /** field.enum() with literal options */
  staticEnum?: Severity;
  /** field.dynamicEnum() - runtime-fetched options */
  dynamicEnum?: Severity;
  /** field.dynamicSchema() - runtime-fetched schema */
  dynamicSchema?: Severity;
  /** field.array() / field.arrayWithConfig() */
  array?: Severity;
  /** field.object() / field.objectWithConfig() */
  object?: Severity;
}

/**
 * Layout and structure constraints - control grouping, conditionals, nesting.
 *
 * @public
 */
export interface LayoutConstraints {
  /** group() - visual grouping of fields */
  group?: Severity;
  /** when() - conditional field visibility */
  conditionals?: Severity;
  /** Maximum nesting depth for objects/arrays (0 = flat only) */
  maxNestingDepth?: number;
}

/**
 * JSON Forms layout type constraints.
 *
 * @public
 */
export interface LayoutTypeConstraints {
  /** VerticalLayout - stack elements vertically */
  VerticalLayout?: Severity;
  /** HorizontalLayout - arrange elements horizontally */
  HorizontalLayout?: Severity;
  /** Group - visual grouping with label */
  Group?: Severity;
  /** Categorization - tabbed/wizard interface */
  Categorization?: Severity;
  /** Category - individual tab/step in Categorization */
  Category?: Severity;
}

/**
 * JSON Forms rule effect constraints.
 *
 * @public
 */
export interface RuleEffectConstraints {
  /** SHOW - show element when condition is true */
  SHOW?: Severity;
  /** HIDE - hide element when condition is true */
  HIDE?: Severity;
  /** ENABLE - enable element when condition is true */
  ENABLE?: Severity;
  /** DISABLE - disable element when condition is true */
  DISABLE?: Severity;
}

/**
 * JSON Forms rule constraints.
 *
 * @public
 */
export interface RuleConstraints {
  /** Whether rules are enabled at all */
  enabled?: Severity;
  /** Fine-grained control over rule effects */
  effects?: RuleEffectConstraints;
}

/**
 * UI schema feature constraints - control JSON Forms-specific features.
 *
 * @public
 */
export interface UISchemaConstraints {
  /** Layout type constraints */
  layouts?: LayoutTypeConstraints;
  /** Rule (conditional) constraints */
  rules?: RuleConstraints;
}

/**
 * Field configuration option constraints - control which field options are allowed.
 *
 * @public
 */
export interface FieldOptionConstraints {
  /** label - field label text */
  label?: Severity;
  /** placeholder - input placeholder text */
  placeholder?: Severity;
  /** required - whether field is required */
  required?: Severity;
  /** minValue - minimum value for numbers */
  minValue?: Severity;
  /** maxValue - maximum value for numbers */
  maxValue?: Severity;
  /** minItems - minimum array length */
  minItems?: Severity;
  /** maxItems - maximum array length */
  maxItems?: Severity;
}

/**
 * Control options constraints - control which JSON Forms Control.options are allowed.
 * These are renderer-specific options that may not be universally supported.
 *
 * @public
 */
export interface ControlOptionConstraints {
  /** format - renderer format hint (e.g., "radio", "textarea") */
  format?: Severity;
  /** readonly - read-only mode */
  readonly?: Severity;
  /** multi - multi-select for enums */
  multi?: Severity;
  /** showUnfocusedDescription - show description when unfocused */
  showUnfocusedDescription?: Severity;
  /** hideRequiredAsterisk - hide required indicator */
  hideRequiredAsterisk?: Severity;
  /** Custom control options (extensible dictionary) */
  custom?: Record<string, Severity>;
}

/**
 * Complete DSL policy for a FormSpec project.
 *
 * @public
 */
export interface DSLPolicy {
  /** Field type constraints */
  fieldTypes?: FieldTypeConstraints;
  /** Layout and structure constraints */
  layout?: LayoutConstraints;
  /** UI schema feature constraints */
  uiSchema?: UISchemaConstraints;
  /** Field configuration option constraints */
  fieldOptions?: FieldOptionConstraints;
  /** Control options constraints */
  controlOptions?: ControlOptionConstraints;
}

/**
 * Complete DSL policy for a FormSpec project.
 *
 * @deprecated Use `DSLPolicy`.
 * @public
 */
export type ConstraintConfig = DSLPolicy;

/**
 * Fully resolved rule constraints with all properties required.
 *
 * @public
 */
export interface ResolvedRuleConstraints {
  /** Effective severity controlling whether UI schema rules are allowed. */
  enabled: Severity;
  /** Effective severity for each supported JSON Forms rule effect. */
  effects: Required<RuleEffectConstraints>;
}

/**
 * Fully resolved UI schema constraints with all properties required.
 *
 * @public
 */
export interface ResolvedUISchemaConstraints {
  /** Effective severities for each supported JSON Forms layout type. */
  layouts: Required<LayoutTypeConstraints>;
  /** Effective rule policy after defaults have been applied. */
  rules: ResolvedRuleConstraints;
}

/**
 * Fully resolved DSL policy with all properties required.
 * This is the type returned by mergeWithDefaults().
 *
 * @public
 */
export interface ResolvedDSLPolicy {
  /** Effective field-builder policy after defaults and overrides are merged. */
  fieldTypes: Required<FieldTypeConstraints>;
  /** Effective nesting and grouping policy after defaults are applied. */
  layout: Required<LayoutConstraints>;
  /** Effective UI-schema policy after defaults and overrides are merged. */
  uiSchema: ResolvedUISchemaConstraints;
  /** Effective policy for field-level builder options. */
  fieldOptions: Required<FieldOptionConstraints>;
  /** Effective policy for renderer-specific control options. */
  controlOptions: Required<ControlOptionConstraints>;
}

/**
 * Fully resolved DSL policy with all properties required.
 *
 * @deprecated Use `ResolvedDSLPolicy`.
 * @public
 */
export type ResolvedConstraintConfig = ResolvedDSLPolicy;

/**
 * Options for validating FormSpec elements against a DSL policy.
 *
 * @public
 */
export interface FormSpecValidationOptions {
  /** DSL-policy configuration (will be merged with defaults). */
  constraints?: DSLPolicy;
}

/**
 * Context for field type validation.
 *
 * @beta
 */
export interface FieldTypeContext {
  /** The _field discriminator value (e.g., "text", "number", "enum") */
  fieldType: string;
  /** The field name */
  fieldName: string;
  /** Optional path for nested fields */
  path?: string;
}

/**
 * Context for layout validation.
 *
 * @beta
 */
export interface LayoutContext {
  /** The type of layout element ("group" | "conditional") */
  layoutType: "group" | "conditional";
  /** Optional label for the element (for groups) */
  label?: string;
  /** Current nesting depth */
  depth: number;
  /** Path to this element */
  path?: string;
}

/**
 * Known field options that can be validated.
 *
 * @beta
 */
export type FieldOption =
  | "label"
  | "placeholder"
  | "required"
  | "minValue"
  | "maxValue"
  | "minItems"
  | "maxItems";

/**
 * Context for field option validation.
 *
 * @beta
 */
export interface FieldOptionsContext {
  /** The field name */
  fieldName: string;
  /** Which options are present on this field */
  presentOptions: FieldOption[];
  /** Path to this field */
  path?: string;
}

/**
 * A single validation issue found during DSL-policy checking.
 *
 * @public
 */
export interface ValidationIssue {
  /** Unique code identifying the issue type */
  code: string;
  /** Human-readable description of the issue */
  message: string;
  /** Severity level of this issue */
  severity: "error" | "warning";
  /** Which policy category this issue belongs to */
  category: "fieldTypes" | "layout" | "uiSchema" | "fieldOptions" | "controlOptions";
  /** JSON pointer or field path to the issue location */
  path?: string;
  /** Name of the affected field (if applicable) */
  fieldName?: string;
  /** Type of the affected field (if applicable) */
  fieldType?: string;
}

/**
 * Result of validating a FormSpec or schema against DSL policy.
 *
 * @public
 */
export interface ValidationResult {
  /** Whether validation passed (no errors, warnings OK) */
  valid: boolean;
  /** List of all issues found */
  issues: ValidationIssue[];
}

/**
 * Forward-looking JSON Schema serialization settings.
 *
 * These values are currently carried through configuration for future
 * vocabulary and dialect emission.
 *
 * @public
 */
export interface FormSpecSerializationConfig {
  /** Base URL used to construct default FormSpec vocabulary URLs. */
  readonly vocabularyBaseUrl?: string;
  /** Per-vocabulary URL overrides keyed by vocabulary identifier. */
  readonly vocabularyUrls?: Readonly<Record<string, string>>;
  /** Explicit FormSpec dialect URL override. */
  readonly dialectUrl?: string;
}

/**
 * Top-level FormSpec configuration structure.
 *
 * @public
 */
export interface FormSpecConfig {
  /**
   * Extension definitions providing custom types, constraints,
   * annotations, and vocabulary keywords.
   */
  readonly extensions?: readonly import("@formspec/core").ExtensionDefinition[];

  /**
   * DSL-policy surface configuration controlling which field types,
   * layouts, UI features, and field/control options are allowed.
   */
  readonly constraints?: DSLPolicy;

  /**
   * Metadata inference and naming policy. Controls how apiName,
   * displayName, and plural forms are derived when not authored.
   */
  readonly metadata?: import("@formspec/core").MetadataPolicyInput;

  /**
   * Vendor prefix for extension-emitted JSON Schema keywords.
   * Must start with "x-".
   * @defaultValue "x-formspec"
   */
  readonly vendorPrefix?: string;

  /**
   * JSON Schema representation for static enums.
   * - "enum": compact `enum` output, plus a display-name extension when labels exist
   * - "oneOf": per-member `const` output, with `title` only for distinct labels
   * - "smart-size": uses `enum` unless a distinct display label would be lost
   * @defaultValue "enum"
   */
  readonly enumSerialization?: "enum" | "oneOf" | "smart-size";

  /**
   * JSON Schema serialization settings for vocabulary and dialect emission.
   * PR-1 stores and resolves this block; PR-2 consumes it.
   */
  readonly serialization?: FormSpecSerializationConfig;

  /**
   * Per-package configuration overrides for monorepos.
   * Keys are glob patterns matched against file paths relative to
   * the config file's directory. Values merge with root settings.
   */
  readonly packages?: Readonly<Record<string, FormSpecPackageOverride>>;
}

/**
 * Per-package overrides that merge with the root config.
 * Only settings that genuinely vary per package are overridable.
 *
 * @public
 */
export interface FormSpecPackageOverride {
  /** Override DSL policy for this package. */
  readonly constraints?: DSLPolicy;
  /** Override enum serialization for this package. */
  readonly enumSerialization?: "enum" | "oneOf" | "smart-size";
  /** Override metadata policy for this package. */
  readonly metadata?: import("@formspec/core").MetadataPolicyInput;
}
