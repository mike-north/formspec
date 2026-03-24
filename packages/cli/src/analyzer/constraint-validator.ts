/**
 * Validates merged constraints for contradictions.
 *
 * After merging type alias chain constraints with field-level constraints,
 * checks for infeasible combinations that would produce an empty value set.
 */

import type { JsonSchema } from "./type-converter.js";

export interface ConstraintViolation {
  fieldName: string;
  severity: "error" | "warning";
  message: string;
}

/**
 * Checks a field's merged JSON Schema for constraint contradictions.
 *
 * Returns an array of violations; an empty array means no issues found.
 */
export function validateConstraints(
  fieldName: string,
  schema: JsonSchema
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  // Inverted numeric bounds
  if (schema.minimum !== undefined && schema.maximum !== undefined) {
    if (schema.minimum > schema.maximum) {
      violations.push({
        fieldName,
        severity: "error",
        message: `Inverted bounds: minimum (${String(schema.minimum)}) > maximum (${String(schema.maximum)})`,
      });
    }
  }

  // Inverted exclusive bounds
  if (schema.exclusiveMinimum !== undefined && schema.exclusiveMaximum !== undefined) {
    if (schema.exclusiveMinimum >= schema.exclusiveMaximum) {
      violations.push({
        fieldName,
        severity: "error",
        message: `Inverted exclusive bounds: exclusiveMinimum (${String(schema.exclusiveMinimum)}) >= exclusiveMaximum (${String(schema.exclusiveMaximum)})`,
      });
    }
  }

  // Mixed: minimum vs exclusiveMaximum
  if (schema.minimum !== undefined && schema.exclusiveMaximum !== undefined) {
    if (schema.minimum >= schema.exclusiveMaximum) {
      violations.push({
        fieldName,
        severity: "error",
        message: `Infeasible: minimum (${String(schema.minimum)}) >= exclusiveMaximum (${String(schema.exclusiveMaximum)})`,
      });
    }
  }

  // Mixed: exclusiveMinimum vs maximum
  if (schema.exclusiveMinimum !== undefined && schema.maximum !== undefined) {
    if (schema.exclusiveMinimum >= schema.maximum) {
      violations.push({
        fieldName,
        severity: "error",
        message: `Infeasible: exclusiveMinimum (${String(schema.exclusiveMinimum)}) >= maximum (${String(schema.maximum)})`,
      });
    }
  }

  // Inverted string length bounds
  if (schema.minLength !== undefined && schema.maxLength !== undefined) {
    if (schema.minLength > schema.maxLength) {
      violations.push({
        fieldName,
        severity: "error",
        message: `Inverted string length: minLength (${String(schema.minLength)}) > maxLength (${String(schema.maxLength)})`,
      });
    }
  }

  // Inverted array bounds
  if (schema.minItems !== undefined && schema.maxItems !== undefined) {
    if (schema.minItems > schema.maxItems) {
      violations.push({
        fieldName,
        severity: "error",
        message: `Inverted array bounds: minItems (${String(schema.minItems)}) > maxItems (${String(schema.maxItems)})`,
      });
    }
  }

  // Empty integer range: multipleOf:1 means integer; check if [min, max] contains one
  if (
    schema.multipleOf === 1 &&
    schema.minimum !== undefined &&
    schema.maximum !== undefined
  ) {
    const minInt = Math.ceil(schema.minimum);
    const maxInt = Math.floor(schema.maximum);
    if (minInt > maxInt) {
      violations.push({
        fieldName,
        severity: "error",
        message: `Empty integer range: no integer exists in [${String(schema.minimum)}, ${String(schema.maximum)}]`,
      });
    }
  }

  return violations;
}
