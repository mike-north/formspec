/**
 * Structure builder functions for organizing form elements.
 *
 * These functions create layout and conditional structures:
 * - `group()` - Visual grouping of fields
 * - `when()` - Conditional visibility based on field values
 * - `formspec()` - Top-level form specification
 */

import type { FormElement, Group, Conditional, FormSpec } from "@formspec/core";
import { validateForm, logValidationIssues } from "./validation.js";

/**
 * Options for creating a form specification.
 */
export interface FormSpecOptions {
  /**
   * Whether to validate the form structure.
   * - `true` or `"warn"`: Validate and log warnings/errors to console
   * - `"throw"`: Validate and throw an error if validation fails
   * - `false`: Skip validation (default in production for performance)
   *
   * @defaultValue false
   */
  validate?: boolean | "warn" | "throw";

  /**
   * Optional name for the form (used in validation messages).
   */
  name?: string;
}

/**
 * Creates a visual group of form elements.
 *
 * Groups provide visual organization and can be rendered as fieldsets or sections.
 * The nesting of groups defines the visual hierarchy of the form.
 *
 * @example
 * ```typescript
 * group("Customer Information",
 *   field.text("name", { label: "Name" }),
 *   field.text("email", { label: "Email" }),
 * )
 * ```
 *
 * @param label - The group's display label
 * @param elements - The form elements contained in this group
 * @returns A Group descriptor
 */
export function group<const Elements extends readonly FormElement[]>(
  label: string,
  ...elements: Elements
): Group<Elements> {
  return { _type: "group", label, elements };
}

/**
 * Creates a conditional wrapper that shows elements based on another field's value.
 *
 * When the specified field has the specified value, the contained elements are shown.
 * Otherwise, they are hidden (but still part of the schema).
 *
 * @example
 * ```typescript
 * field.enum("status", ["draft", "sent", "paid"] as const),
 * when("status", "draft",
 *   field.text("internalNotes", { label: "Internal Notes" }),
 * )
 * ```
 *
 * @param fieldName - The field to check
 * @param value - The value that triggers the condition
 * @param elements - The form elements to show when condition is met
 * @returns A Conditional descriptor
 */
export function when<
  const K extends string,
  const V,
  const Elements extends readonly FormElement[],
>(
  fieldName: K,
  value: V,
  ...elements: Elements
): Conditional<K, V, Elements> {
  return {
    _type: "conditional",
    field: fieldName,
    value,
    elements,
  };
}

/**
 * Creates a complete form specification.
 *
 * The structure IS the definition:
 * - Nesting with `group()` defines visual layout
 * - Nesting with `when()` defines conditional visibility
 * - Field type implies control type (text field → text input)
 * - Array position implies field ordering
 *
 * Schema is automatically inferred from all fields in the structure.
 *
 * @example
 * ```typescript
 * const InvoiceForm = formspec(
 *   group("Customer",
 *     field.text("customerName", { label: "Customer Name" }),
 *     field.dynamicEnum("country", "countries", { label: "Country" }),
 *   ),
 *   group("Invoice Details",
 *     field.number("amount", { label: "Amount", min: 0 }),
 *     field.enum("status", ["draft", "sent", "paid"] as const),
 *     when("status", "draft",
 *       field.text("internalNotes", { label: "Internal Notes" }),
 *     ),
 *   ),
 * );
 * ```
 *
 * @param elements - The top-level form elements
 * @returns A FormSpec descriptor
 */
export function formspec<const Elements extends readonly FormElement[]>(
  ...elements: Elements
): FormSpec<Elements> {
  return { elements };
}

/**
 * Creates a complete form specification with validation options.
 *
 * @example
 * ```typescript
 * const form = formspecWithValidation(
 *   { validate: true, name: "MyForm" },
 *   field.text("name"),
 *   field.enum("status", ["draft", "sent"] as const),
 *   when("status", "draft",
 *     field.text("notes"),
 *   ),
 * );
 * ```
 *
 * @param options - Validation options
 * @param elements - The top-level form elements
 * @returns A FormSpec descriptor
 */
export function formspecWithValidation<const Elements extends readonly FormElement[]>(
  options: FormSpecOptions,
  ...elements: Elements
): FormSpec<Elements> {
  // Run validation if requested
  if (options.validate) {
    const result = validateForm(elements);

    if (options.validate === "throw" && !result.valid) {
      const errors = result.issues
        .filter((i) => i.severity === "error")
        .map((i) => i.message)
        .join("; ");
      throw new Error(`Form validation failed: ${errors}`);
    }

    if (options.validate === true || options.validate === "warn") {
      logValidationIssues(result, options.name);
    }
  }

  return { elements };
}
