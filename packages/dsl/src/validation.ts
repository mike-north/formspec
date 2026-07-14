/**
 * Runtime validation for form specifications.
 *
 * Validates:
 * - No duplicate field names at the same scope level
 * - All field references in conditionals point to existing fields
 */

import type { FormElement, Group, Conditional, ArrayField, ObjectField } from "@formspec/core";

/**
 * Validation issue severity levels.
 *
 * @public
 */
export type ValidationSeverity = "error" | "warning";

/**
 * A validation issue found in a form specification.
 *
 * @public
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
 *
 * @public
 */
export interface ValidationResult {
  /** Whether the form is valid (no errors, warnings are ok) */
  valid: boolean;
  /** List of validation issues found */
  issues: ValidationIssue[];
}

/**
 * Collects the flat set of all field names reachable from a list of form
 * elements, regardless of scope. Used only for conditional-reference
 * existence checks (`collectConditionalReferences`), which are intentionally
 * scope-agnostic (see issue #511 non-goals).
 */
function collectAllFieldNames(elements: readonly FormElement[]): Set<string> {
  const fieldNames = new Set<string>();

  function visit(elements: readonly FormElement[]): void {
    for (const element of elements) {
      switch (element._type) {
        case "field": {
          // After type narrowing, element is known to be AnyField
          const field = element;
          fieldNames.add(field.name);

          // Recurse into array items and object properties
          if (field._field === "array") {
            const arrayField = field as ArrayField<string, readonly FormElement[]>;
            visit(arrayField.items);
          } else if (field._field === "object") {
            const objectField = field as ObjectField<string, readonly FormElement[]>;
            visit(objectField.properties);
          }
          break;
        }

        case "group": {
          const group = element as Group<readonly FormElement[]>;
          visit(group.elements);
          break;
        }

        case "conditional": {
          const conditional = element as Conditional<string, unknown, readonly FormElement[]>;
          visit(conditional.elements);
          break;
        }
      }
    }
  }

  visit(elements);
  return fieldNames;
}

/**
 * Finds duplicate field names, scoped per docs/000-principles.md C4 and
 * GLOSSARY.md: `field.object()` properties and `field.array()` items each
 * open a new schema scope, so a name reused across that boundary (e.g. a
 * top-level `id` plus `user.id`) is not a duplicate. Groups and conditionals
 * are UI-only and stay flat within the enclosing scope, so names reused
 * inside them still collide with the enclosing scope.
 */
function findDuplicateFieldIssues(
  elements: readonly FormElement[],
  scopePath: string
): ValidationIssue[] {
  const scopeNames = new Map<string, { count: number; paths: string[] }>();
  const nestedScopeIssues: ValidationIssue[] = [];

  function visit(elements: readonly FormElement[], currentPath: string): void {
    for (const element of elements) {
      switch (element._type) {
        case "field": {
          // After type narrowing, element is known to be AnyField
          const field = element;
          const fieldPath = currentPath ? `${currentPath}.${field.name}` : field.name;
          const existing = scopeNames.get(field.name);
          if (existing !== undefined) {
            existing.count++;
            existing.paths.push(fieldPath);
          } else {
            scopeNames.set(field.name, { count: 1, paths: [fieldPath] });
          }

          // Array items and object properties are separate schema scopes -
          // their duplicate names are evaluated independently of this scope.
          if (field._field === "array") {
            const arrayField = field as ArrayField<string, readonly FormElement[]>;
            nestedScopeIssues.push(...findDuplicateFieldIssues(arrayField.items, `${fieldPath}[]`));
          } else if (field._field === "object") {
            const objectField = field as ObjectField<string, readonly FormElement[]>;
            nestedScopeIssues.push(...findDuplicateFieldIssues(objectField.properties, fieldPath));
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

  visit(elements, scopePath);

  const scopeIssues: ValidationIssue[] = [];
  for (const [name, info] of scopeNames) {
    if (info.count > 1 && info.paths[0] !== undefined) {
      scopeIssues.push({
        severity: "error",
        message: `Duplicate field name "${name}" found ${String(info.count)} times at: ${info.paths.join(", ")}`,
        path: info.paths[0],
      });
    }
  }

  return [...scopeIssues, ...nestedScopeIssues];
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
 * - Duplicate field names within the same schema scope (error). The root
 *   elements form one scope; each `field.object()`'s properties and each
 *   `field.array()`'s items form their own nested scope, so a name reused
 *   across a scope boundary (e.g. a top-level `id` and a nested `user.id`)
 *   is not reported. Groups and conditionals do not open a new scope, so
 *   duplicates inside them still collide with the enclosing scope.
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
 *
 * @public
 */
export function validateForm(elements: readonly FormElement[]): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Check for duplicate field names within each schema scope - duplicates are
  // errors because they cause data loss. Object/array boundaries open a new
  // scope; groups/conditionals stay flat within the enclosing scope.
  issues.push(...findDuplicateFieldIssues(elements, ""));

  // Collect all field names (flat, across every scope) for conditional
  // reference existence checks
  const fieldNames = collectAllFieldNames(elements);

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
 *
 * @public
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
