import type {
  FieldOptionConstraints,
  Severity,
  ValidationIssue,
} from "../types.js";

/**
 * Known field options that can be validated.
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
 * Validates field options against constraints.
 *
 * @param context - Information about the field and its options
 * @param constraints - Field option constraints
 * @returns Array of validation issues (empty if valid)
 */
export function validateFieldOptions(
  context: FieldOptionsContext,
  constraints: FieldOptionConstraints
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const option of context.presentOptions) {
    const severity = constraints[option];
    if (severity && severity !== "off") {
      issues.push(createFieldOptionIssue(context, option, severity));
    }
  }

  return issues;
}

/**
 * Creates a validation issue for a disallowed field option.
 */
function createFieldOptionIssue(
  context: FieldOptionsContext,
  option: FieldOption,
  severity: Severity
): ValidationIssue {
  const path = context.path ?? context.fieldName;
  return {
    code: "DISALLOWED_FIELD_OPTION",
    message: `Field "${context.fieldName}" uses the "${option}" option, which is not allowed in this project`,
    severity: severity === "error" ? "error" : "warning",
    category: "fieldOptions",
    path,
    fieldName: context.fieldName,
  };
}

/**
 * Extracts which options are present on a field object.
 * Works with FormSpec field types.
 *
 * @param field - A field object with potential options
 * @returns Array of present option names
 */
export function extractFieldOptions(
  field: Record<string, unknown>
): FieldOption[] {
  const options: FieldOption[] = [];

  if (field["label"] !== undefined) options.push("label");
  if (field["placeholder"] !== undefined) options.push("placeholder");
  if (field["required"] !== undefined) options.push("required");
  // NumberField uses "min"/"max" in core types, map to "minValue"/"maxValue" constraints
  if (field["min"] !== undefined || field["minValue"] !== undefined)
    options.push("minValue");
  if (field["max"] !== undefined || field["maxValue"] !== undefined)
    options.push("maxValue");
  if (field["minItems"] !== undefined) options.push("minItems");
  if (field["maxItems"] !== undefined) options.push("maxItems");

  return options;
}

/**
 * Checks if a specific field option is allowed.
 *
 * @param option - The option to check
 * @param constraints - Field option constraints
 * @returns true if allowed, false if disallowed
 */
export function isFieldOptionAllowed(
  option: FieldOption,
  constraints: FieldOptionConstraints
): boolean {
  const severity = constraints[option];
  return !severity || severity === "off";
}

/**
 * Gets the severity level for a field option.
 *
 * @param option - The option to check
 * @param constraints - Field option constraints
 * @returns Severity level, or "off" if not constrained
 */
export function getFieldOptionSeverity(
  option: FieldOption,
  constraints: FieldOptionConstraints
): Severity {
  return constraints[option] ?? "off";
}
