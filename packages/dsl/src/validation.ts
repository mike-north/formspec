/**
 * Runtime validation for form specifications.
 *
 * Validates:
 * - No duplicate field names at the same scope level
 * - All field references in conditionals point to existing fields
 */

import type {
  FormElement,
  Group,
  Conditional,
  ArrayField,
  ObjectField,
} from "@formspec/core";

/**
 * Validation issue severity levels.
 */
export type ValidationSeverity = "error" | "warning";

/**
 * A validation issue found in a form specification.
 */
export interface ValidationIssue {
  /** Severity of the issue */
  severity: ValidationSeverity;
  /** Human-readable message describing the issue */
  message: string;
  /** Path to the element with the issue (e.g., "group.fieldName") */
  path: string;
}

/**
 * Result of validating a form specification.
 */
export interface ValidationResult {
  /** Whether the form is valid (no errors, warnings are ok) */
  valid: boolean;
  /** List of validation issues found */
  issues: ValidationIssue[];
}

/**
 * Collects all field names from a list of form elements.
 * Returns a Map of field name to count (for duplicate detection).
 */
function collectFieldNames(
  elements: readonly FormElement[],
  path = ""
): Map<string, { count: number; paths: string[] }> {
  const fieldNames = new Map<string, { count: number; paths: string[] }>();

  function visit(elements: readonly FormElement[], currentPath: string): void {
    for (const element of elements) {
      switch (element._type) {
        case "field": {
          // After type narrowing, element is known to be AnyField
          const field = element;
          const fieldPath = currentPath ? `${currentPath}.${field.name}` : field.name;
          const existing = fieldNames.get(field.name);
          if (existing !== undefined) {
            existing.count++;
            existing.paths.push(fieldPath);
          } else {
            fieldNames.set(field.name, { count: 1, paths: [fieldPath] });
          }

          // Recurse into array items and object properties
          if (field._field === "array") {
            const arrayField = field as ArrayField<string, readonly FormElement[]>;
            visit(arrayField.items, `${fieldPath}[]`);
          } else if (field._field === "object") {
            const objectField = field as ObjectField<string, readonly FormElement[]>;
            visit(objectField.properties, fieldPath);
          }
          break;
        }

        case "group": {
          const group = element as Group<readonly FormElement[]>;
          const groupPath = currentPath ? `${currentPath}.[${group.label}]` : `[${group.label}]`;
          visit(group.elements, groupPath);
          break;
        }

        case "conditional": {
          const conditional = element as Conditional<string, unknown, readonly FormElement[]>;
          const conditionalPath = currentPath
            ? `${currentPath}.when(${conditional.field})`
            : `when(${conditional.field})`;
          visit(conditional.elements, conditionalPath);
          break;
        }
      }
    }
  }

  visit(elements, path);
  return fieldNames;
}

/**
 * Collects all field references from conditionals.
 * Returns a list of { fieldName, path } for each reference.
 */
function collectConditionalReferences(
  elements: readonly FormElement[],
  path = ""
): { fieldName: string; path: string }[] {
  const references: { fieldName: string; path: string }[] = [];

  function visit(elements: readonly FormElement[], currentPath: string): void {
    for (const element of elements) {
      switch (element._type) {
        case "field": {
          // After type narrowing, element is known to be AnyField
          const field = element;
          const fieldPath = currentPath ? `${currentPath}.${field.name}` : field.name;

          // Recurse into array items and object properties
          if (field._field === "array") {
            const arrayField = field as ArrayField<string, readonly FormElement[]>;
            visit(arrayField.items, `${fieldPath}[]`);
          } else if (field._field === "object") {
            const objectField = field as ObjectField<string, readonly FormElement[]>;
            visit(objectField.properties, fieldPath);
          }
          break;
        }

        case "group": {
          const group = element as Group<readonly FormElement[]>;
          const groupPath = currentPath ? `${currentPath}.[${group.label}]` : `[${group.label}]`;
          visit(group.elements, groupPath);
          break;
        }

        case "conditional": {
          const conditional = element as Conditional<string, unknown, readonly FormElement[]>;
          const conditionalPath = currentPath
            ? `${currentPath}.when(${conditional.field})`
            : `when(${conditional.field})`;

          // Record this reference
          references.push({
            fieldName: conditional.field,
            path: conditionalPath,
          });

          // Continue visiting children
          visit(conditional.elements, conditionalPath);
          break;
        }
      }
    }
  }

  visit(elements, path);
  return references;
}

/**
 * Validates a form specification for common issues.
 *
 * Checks for:
 * - Duplicate field names at the root level (warning)
 * - References to non-existent fields in conditionals (error)
 *
 * @example
 * ```typescript
 * const form = formspec(
 *   field.text("name"),
 *   field.text("name"), // Duplicate!
 *   when("nonExistent", "value", // Reference to non-existent field!
 *     field.text("extra"),
 *   ),
 * );
 *
 * const result = validateForm(form.elements);
 * // result.valid === false
 * // result.issues contains duplicate and reference errors
 * ```
 *
 * @param elements - The form elements to validate
 * @returns Validation result with any issues found
 */
export function validateForm(elements: readonly FormElement[]): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Collect all field names
  const fieldNames = collectFieldNames(elements);

  // Check for duplicates at root level - duplicates are errors because they cause data loss
  for (const [name, info] of fieldNames) {
    if (info.count > 1 && info.paths[0] !== undefined) {
      issues.push({
        severity: "error",
        message: `Duplicate field name "${name}" found ${String(info.count)} times at: ${info.paths.join(", ")}`,
        path: info.paths[0],
      });
    }
  }

  // Collect conditional references
  const references = collectConditionalReferences(elements);

  // Check that all referenced fields exist
  for (const ref of references) {
    if (!fieldNames.has(ref.fieldName)) {
      issues.push({
        severity: "error",
        message: `Conditional references non-existent field "${ref.fieldName}"`,
        path: ref.path,
      });
    }
  }

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
}

/**
 * Logs validation issues to the console.
 *
 * @param result - The validation result to log
 * @param formName - Optional name for the form (for better error messages)
 */
export function logValidationIssues(result: ValidationResult, formName?: string): void {
  if (result.issues.length === 0) {
    return;
  }

  const prefix = formName ? `FormSpec "${formName}"` : "FormSpec";

  for (const issue of result.issues) {
    const location = issue.path ? ` at ${issue.path}` : "";
    const message = `${prefix}: ${issue.message}${location}`;

    if (issue.severity === "error") {
      console.error(message);
    } else {
      console.warn(message);
    }
  }
}

