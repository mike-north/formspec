import type {
  FieldTypeConstraints,
  Severity,
  ValidationIssue,
} from "../types.js";

/**
 * Maps FormSpec field._field values to constraint config keys.
 */
const FIELD_TYPE_MAP: Record<string, keyof FieldTypeConstraints> = {
  text: "text",
  number: "number",
  boolean: "boolean",
  enum: "staticEnum",
  dynamic_enum: "dynamicEnum",
  dynamic_schema: "dynamicSchema",
  array: "array",
  object: "object",
};

/**
 * Human-readable names for field types.
 */
const FIELD_TYPE_NAMES: Record<string, string> = {
  text: "text field",
  number: "number field",
  boolean: "boolean field",
  enum: "static enum field",
  dynamic_enum: "dynamic enum field",
  dynamic_schema: "dynamic schema field",
  array: "array field",
  object: "object field",
};

/**
 * Context for field type validation.
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
 * Validates a field type against constraints.
 *
 * @param context - Information about the field being validated
 * @param constraints - Field type constraints
 * @returns Array of validation issues (empty if valid)
 */
export function validateFieldTypes(
  context: FieldTypeContext,
  constraints: FieldTypeConstraints
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const constraintKey = FIELD_TYPE_MAP[context.fieldType];
  if (!constraintKey) {
    // Unknown field type, skip validation
    return issues;
  }

  const severity = constraints[constraintKey];
  if (severity && severity !== "off") {
    const fieldTypeName = FIELD_TYPE_NAMES[context.fieldType] || context.fieldType;
    issues.push(createFieldTypeIssue(context, fieldTypeName, severity));
  }

  return issues;
}

/**
 * Creates a validation issue for a disallowed field type.
 */
function createFieldTypeIssue(
  context: FieldTypeContext,
  fieldTypeName: string,
  severity: Severity
): ValidationIssue {
  const path = context.path || context.fieldName;
  return {
    code: "DISALLOWED_FIELD_TYPE",
    message: `Field "${context.fieldName}" uses ${fieldTypeName}, which is not allowed in this project`,
    severity: severity === "error" ? "error" : "warning",
    category: "fieldTypes",
    path,
    fieldName: context.fieldName,
    fieldType: context.fieldType,
  };
}

/**
 * Checks if a field type is allowed by the constraints.
 * Useful for quick checks without generating issues.
 *
 * @param fieldType - The _field discriminator value
 * @param constraints - Field type constraints
 * @returns true if allowed, false if disallowed
 */
export function isFieldTypeAllowed(
  fieldType: string,
  constraints: FieldTypeConstraints
): boolean {
  const constraintKey = FIELD_TYPE_MAP[fieldType];
  if (!constraintKey) {
    return true; // Unknown types are allowed by default
  }

  const severity = constraints[constraintKey];
  return !severity || severity === "off";
}

/**
 * Gets the severity level for a field type.
 *
 * @param fieldType - The _field discriminator value
 * @param constraints - Field type constraints
 * @returns Severity level, or "off" if not constrained
 */
export function getFieldTypeSeverity(
  fieldType: string,
  constraints: FieldTypeConstraints
): Severity {
  const constraintKey = FIELD_TYPE_MAP[fieldType];
  if (!constraintKey) {
    return "off";
  }

  return constraints[constraintKey] ?? "off";
}
