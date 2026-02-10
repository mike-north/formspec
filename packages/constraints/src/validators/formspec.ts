import type { FormElement, FormSpec, AnyField } from "@formspec/core";
import type { ConstraintConfig, ResolvedConstraintConfig, ValidationIssue, ValidationResult } from "../types.js";
import { mergeWithDefaults } from "../defaults.js";
import { validateFieldTypes } from "./field-types.js";
import { validateLayout } from "./layout.js";
import { validateFieldOptions, extractFieldOptions } from "./field-options.js";

/**
 * Options for validating FormSpec elements.
 */
export interface FormSpecValidationOptions {
  /** Constraint configuration (will be merged with defaults) */
  constraints?: ConstraintConfig;
}

/**
 * Validates FormSpec elements against constraints.
 *
 * This is the main entry point for validating a form specification
 * against a constraint configuration. It walks through all elements
 * and checks each one against the configured constraints.
 *
 * @param elements - FormSpec elements to validate
 * @param options - Validation options including constraints
 * @returns Validation result with all issues found
 *
 * @example
 * ```ts
 * import { formspec, field, group } from '@formspec/dsl';
 * import { validateFormSpecElements, defineConstraints } from '@formspec/constraints';
 *
 * const form = formspec(
 *   group("Contact",
 *     field.text("name"),
 *     field.dynamicEnum("country", "countries"),
 *   ),
 * );
 *
 * const result = validateFormSpecElements(form.elements, {
 *   constraints: {
 *     fieldTypes: { dynamicEnum: 'error' },
 *     layout: { group: 'error' },
 *   },
 * });
 *
 * if (!result.valid) {
 *   console.error('Validation failed:', result.issues);
 * }
 * ```
 */
export function validateFormSpecElements(
  elements: readonly FormElement[],
  options: FormSpecValidationOptions = {}
): ValidationResult {
  const constraints = mergeWithDefaults(options.constraints);
  const issues: ValidationIssue[] = [];

  // Walk through all elements
  walkElements(elements, constraints, issues, "", 0);

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}

/**
 * Validates a complete FormSpec against constraints.
 *
 * @param formSpec - The FormSpec to validate
 * @param options - Validation options including constraints
 * @returns Validation result with all issues found
 */
export function validateFormSpec(
  formSpec: FormSpec<readonly FormElement[]>,
  options: FormSpecValidationOptions = {}
): ValidationResult {
  return validateFormSpecElements(formSpec.elements, options);
}

/**
 * Recursively walks through FormSpec elements and validates each one.
 */
function walkElements(
  elements: readonly FormElement[],
  constraints: ResolvedConstraintConfig,
  issues: ValidationIssue[],
  pathPrefix: string,
  depth: number
): void {
  for (const element of elements) {
    const elementPath = pathPrefix;

    if (element._type === "field") {
      validateField(element, constraints, issues, elementPath, depth);
    } else if (element._type === "group") {
      validateGroup(element, constraints, issues, elementPath, depth);
    } else {
      // element._type === "conditional"
      validateConditional(element, constraints, issues, elementPath, depth);
    }
  }
}

/**
 * Validates a field element.
 */
function validateField(
  field: AnyField,
  constraints: ResolvedConstraintConfig,
  issues: ValidationIssue[],
  pathPrefix: string,
  depth: number
): void {
  const fieldPath = pathPrefix ? `${pathPrefix}/${field.name}` : field.name;

  // Validate field type
  const fieldTypeIssues = validateFieldTypes(
    {
      fieldType: field._field,
      fieldName: field.name,
      path: fieldPath,
    },
    constraints.fieldTypes
  );
  issues.push(...fieldTypeIssues);

  // Validate field options
  const presentOptions = extractFieldOptions(field as unknown as Record<string, unknown>);
  if (presentOptions.length > 0) {
    const optionIssues = validateFieldOptions(
      {
        fieldName: field.name,
        presentOptions,
        path: fieldPath,
      },
      constraints.fieldOptions
    );
    issues.push(...optionIssues);
  }

  // Check nesting depth for array/object fields
  if (field._field === "array" || field._field === "object") {
    const layoutIssues = validateLayout(
      {
        layoutType: "group", // Arrays/objects contribute to nesting depth
        depth: depth + 1,
        path: fieldPath,
      },
      constraints.layout
    );
    // Only add nesting depth issues, not group issues
    issues.push(
      ...layoutIssues.filter((issue) => issue.code === "EXCEEDED_NESTING_DEPTH")
    );

    // Recursively validate nested elements
    if (field._field === "array" && "items" in field) {
      walkElements(
        field.items as readonly FormElement[],
        constraints,
        issues,
        `${fieldPath}[]`,
        depth + 1
      );
    } else if ("properties" in field) {
      // field._field === "object"
      walkElements(
        field.properties as readonly FormElement[],
        constraints,
        issues,
        fieldPath,
        depth + 1
      );
    }
  }
}

/**
 * Validates a group element.
 */
function validateGroup(
  group: { readonly _type: "group"; readonly label: string; readonly elements: readonly FormElement[] },
  constraints: ResolvedConstraintConfig,
  issues: ValidationIssue[],
  pathPrefix: string,
  depth: number
): void {
  const groupPath = pathPrefix ? `${pathPrefix}/[group:${group.label}]` : `[group:${group.label}]`;

  // Validate group usage
  const layoutIssues = validateLayout(
    {
      layoutType: "group",
      label: group.label,
      depth,
      path: groupPath,
    },
    constraints.layout
  );
  issues.push(...layoutIssues);

  // Recursively validate nested elements (groups don't increase nesting depth for schema)
  walkElements(group.elements, constraints, issues, pathPrefix, depth);
}

/**
 * Validates a conditional element.
 */
function validateConditional(
  conditional: {
    readonly _type: "conditional";
    readonly field: string;
    readonly value: unknown;
    readonly elements: readonly FormElement[];
  },
  constraints: ResolvedConstraintConfig,
  issues: ValidationIssue[],
  pathPrefix: string,
  depth: number
): void {
  const condPath = pathPrefix
    ? `${pathPrefix}/[when:${conditional.field}=${String(conditional.value)}]`
    : `[when:${conditional.field}=${String(conditional.value)}]`;

  // Validate conditional usage
  const layoutIssues = validateLayout(
    {
      layoutType: "conditional",
      depth,
      path: condPath,
    },
    constraints.layout
  );
  issues.push(...layoutIssues);

  // Recursively validate nested elements
  walkElements(conditional.elements, constraints, issues, pathPrefix, depth);
}
