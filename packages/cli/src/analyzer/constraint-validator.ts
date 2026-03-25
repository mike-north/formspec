/**
 * Validates merged constraints for contradictions.
 *
 * After merging type alias chain constraints with field-level constraints,
 * checks for infeasible combinations that would produce an empty value set.
 */

import type { JsonSchema } from "./type-converter.js";

export interface ConstraintViolation {
  readonly fieldName: string;
  readonly severity: "error" | "warning";
  readonly message: string;
}

/**
 * Flattens an allOf schema into a single merged constraint set.
 * When a field uses $ref + allOf composition, constraints may be spread
 * across multiple allOf members. This collects them for validation.
 *
 * Note: This does NOT resolve $ref pointers (that requires the full $defs
 * registry). It only collects constraints from inline allOf members.
 */
function flattenAllOfConstraints(schema: JsonSchema): JsonSchema {
  if (!schema.allOf) return schema;

  const merged: JsonSchema = { ...schema };
  delete merged.allOf;

  for (const member of schema.allOf) {
    // Skip $ref-only members (can't resolve without registry)
    if (member.$ref && Object.keys(member).length === 1) continue;

    // Merge constraint fields from this allOf member
    if (member.minimum !== undefined) merged.minimum = merged.minimum !== undefined ? Math.max(merged.minimum, member.minimum) : member.minimum;
    if (member.maximum !== undefined) merged.maximum = merged.maximum !== undefined ? Math.min(merged.maximum, member.maximum) : member.maximum;
    if (member.exclusiveMinimum !== undefined) merged.exclusiveMinimum = member.exclusiveMinimum;
    if (member.exclusiveMaximum !== undefined) merged.exclusiveMaximum = member.exclusiveMaximum;
    if (member.multipleOf !== undefined) merged.multipleOf = member.multipleOf;
    if (member.minLength !== undefined) merged.minLength = merged.minLength !== undefined ? Math.max(merged.minLength, member.minLength) : member.minLength;
    if (member.maxLength !== undefined) merged.maxLength = merged.maxLength !== undefined ? Math.min(merged.maxLength, member.maxLength) : member.maxLength;
    if (member.minItems !== undefined) merged.minItems = merged.minItems !== undefined ? Math.max(merged.minItems, member.minItems) : member.minItems;
    if (member.maxItems !== undefined) merged.maxItems = merged.maxItems !== undefined ? Math.min(merged.maxItems, member.maxItems) : member.maxItems;
  }

  return merged;
}

/**
 * Checks a field's merged JSON Schema for constraint contradictions.
 *
 * When the schema uses allOf composition (e.g., from $ref + field-level
 * constraints), constraints are flattened before checking.
 *
 * Returns an array of violations; an empty array means no issues found.
 */
export function validateConstraints(fieldName: string, schema: JsonSchema): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const effective = flattenAllOfConstraints(schema);

  // Inverted numeric bounds
  if (effective.minimum !== undefined && effective.maximum !== undefined) {
    if (effective.minimum > effective.maximum) {
      violations.push({
        fieldName,
        severity: "error",
        message: `Inverted bounds: minimum (${String(effective.minimum)}) > maximum (${String(effective.maximum)})`,
      });
    }
  }

  // Inverted exclusive bounds
  if (effective.exclusiveMinimum !== undefined && effective.exclusiveMaximum !== undefined) {
    if (effective.exclusiveMinimum >= effective.exclusiveMaximum) {
      violations.push({
        fieldName,
        severity: "error",
        message: `Inverted exclusive bounds: exclusiveMinimum (${String(effective.exclusiveMinimum)}) >= exclusiveMaximum (${String(effective.exclusiveMaximum)})`,
      });
    }
  }

  // Mixed: minimum vs exclusiveMaximum
  if (effective.minimum !== undefined && effective.exclusiveMaximum !== undefined) {
    if (effective.minimum >= effective.exclusiveMaximum) {
      violations.push({
        fieldName,
        severity: "error",
        message: `Infeasible: minimum (${String(effective.minimum)}) >= exclusiveMaximum (${String(effective.exclusiveMaximum)})`,
      });
    }
  }

  // Mixed: exclusiveMinimum vs maximum
  if (effective.exclusiveMinimum !== undefined && effective.maximum !== undefined) {
    if (effective.exclusiveMinimum >= effective.maximum) {
      violations.push({
        fieldName,
        severity: "error",
        message: `Infeasible: exclusiveMinimum (${String(effective.exclusiveMinimum)}) >= maximum (${String(effective.maximum)})`,
      });
    }
  }

  // Inverted string length bounds
  if (effective.minLength !== undefined && effective.maxLength !== undefined) {
    if (effective.minLength > effective.maxLength) {
      violations.push({
        fieldName,
        severity: "error",
        message: `Inverted string length: minLength (${String(effective.minLength)}) > maxLength (${String(effective.maxLength)})`,
      });
    }
  }

  // Inverted array bounds
  if (effective.minItems !== undefined && effective.maxItems !== undefined) {
    if (effective.minItems > effective.maxItems) {
      violations.push({
        fieldName,
        severity: "error",
        message: `Inverted array bounds: minItems (${String(effective.minItems)}) > maxItems (${String(effective.maxItems)})`,
      });
    }
  }

  // Empty integer range: multipleOf:1 means integer; check if [min, max] contains one
  if (effective.multipleOf === 1 && effective.minimum !== undefined && effective.maximum !== undefined) {
    const minInt = Math.ceil(effective.minimum);
    const maxInt = Math.floor(effective.maximum);
    if (minInt > maxInt) {
      violations.push({
        fieldName,
        severity: "error",
        message: `Empty integer range: no integer exists in [${String(effective.minimum)}, ${String(effective.maximum)}]`,
      });
    }
  }

  return violations;
}
