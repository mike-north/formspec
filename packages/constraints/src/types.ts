/**
 * Severity level for constraint violations.
 * - "error": Violation fails validation
 * - "warn": Violation emits warning but passes
 * - "off": Feature is allowed (no violation)
 */
export type Severity = "error" | "warn" | "off";

/**
 * Field type constraints - control which field types are allowed.
 * Fine-grained control over each DSL field builder.
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
 * JSONForms layout type constraints.
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
 * JSONForms rule effect constraints.
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
 * JSONForms rule constraints.
 */
export interface RuleConstraints {
  /** Whether rules are enabled at all */
  enabled?: Severity;
  /** Fine-grained control over rule effects */
  effects?: RuleEffectConstraints;
}

/**
 * UI Schema feature constraints - control JSONForms-specific features.
 */
export interface UISchemaConstraints {
  /** Layout type constraints */
  layouts?: LayoutTypeConstraints;
  /** Rule (conditional) constraints */
  rules?: RuleConstraints;
}

/**
 * Field configuration option constraints - control which field options are allowed.
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
 * Control options constraints - control which JSONForms Control.options are allowed.
 * These are renderer-specific options that may not be universally supported.
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
 * Complete constraint configuration for a FormSpec project.
 */
export interface ConstraintConfig {
  /** Field type constraints */
  fieldTypes?: FieldTypeConstraints;
  /** Layout and structure constraints */
  layout?: LayoutConstraints;
  /** UI Schema feature constraints */
  uiSchema?: UISchemaConstraints;
  /** Field configuration option constraints */
  fieldOptions?: FieldOptionConstraints;
  /** Control options constraints */
  controlOptions?: ControlOptionConstraints;
}

/**
 * Fully resolved rule constraints with all properties required.
 */
export interface ResolvedRuleConstraints {
  enabled: Severity;
  effects: Required<RuleEffectConstraints>;
}

/**
 * Fully resolved UI schema constraints with all properties required.
 */
export interface ResolvedUISchemaConstraints {
  layouts: Required<LayoutTypeConstraints>;
  rules: ResolvedRuleConstraints;
}

/**
 * Fully resolved constraint configuration with all properties required.
 * This is the type returned by mergeWithDefaults().
 */
export interface ResolvedConstraintConfig {
  fieldTypes: Required<FieldTypeConstraints>;
  layout: Required<LayoutConstraints>;
  uiSchema: ResolvedUISchemaConstraints;
  fieldOptions: Required<FieldOptionConstraints>;
  controlOptions: Required<ControlOptionConstraints>;
}

/**
 * Top-level FormSpec configuration file structure.
 * The .formspec.yml file uses this structure.
 */
export interface FormSpecConfig {
  /** Constraint configuration */
  constraints?: ConstraintConfig;
  // Future: other top-level config sections
  // build?: BuildConfig;
  // presets?: string[];
}

/**
 * A single validation issue found during constraint checking.
 */
export interface ValidationIssue {
  /** Unique code identifying the issue type */
  code: string;
  /** Human-readable description of the issue */
  message: string;
  /** Severity level of this issue */
  severity: "error" | "warning";
  /** Which constraint category this issue belongs to */
  category:
    | "fieldTypes"
    | "layout"
    | "uiSchema"
    | "fieldOptions"
    | "controlOptions";
  /** JSON pointer or field path to the issue location */
  path?: string;
  /** Name of the affected field (if applicable) */
  fieldName?: string;
  /** Type of the affected field (if applicable) */
  fieldType?: string;
}

/**
 * Result of validating a FormSpec or schema against constraints.
 */
export interface ValidationResult {
  /** Whether validation passed (no errors, warnings OK) */
  valid: boolean;
  /** List of all issues found */
  issues: ValidationIssue[];
}
