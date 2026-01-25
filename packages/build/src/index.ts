/**
 * `@formspec/build` - Build tools for FormSpec
 *
 * This package provides generators to compile FormSpec forms into:
 * - JSON Schema (for validation)
 * - JSON Forms UI Schema (for rendering)
 *
 * @example
 * ```typescript
 * import { buildFormSchemas } from "@formspec/build";
 * import { formspec, field, group } from "@formspec/dsl";
 *
 * const form = formspec(
 *   group("Customer",
 *     field.text("name", { label: "Name", required: true }),
 *     field.text("email", { label: "Email" }),
 *   ),
 * );
 *
 * const { jsonSchema, uiSchema } = buildFormSchemas(form);
 * ```
 *
 * @packageDocumentation
 */

import type { FormElement, FormSpec } from "@formspec/core";
import { generateJsonSchema } from "./json-schema/generator.js";
import { generateUiSchema } from "./ui-schema/generator.js";
import type { JSONSchema7 } from "./json-schema/types.js";
import type { UISchema } from "./ui-schema/types.js";

// Re-export types
export type {
  JSONSchema7,
  JSONSchemaType,
} from "./json-schema/types.js";

export type {
  UISchema,
  UISchemaElement,
  UISchemaElementType,
  ControlElement,
  VerticalLayout,
  HorizontalLayout,
  GroupLayout,
  Rule,
  RuleEffect,
  SchemaBasedCondition,
} from "./ui-schema/types.js";

// Re-export individual generators
export { generateJsonSchema } from "./json-schema/generator.js";
export { generateUiSchema } from "./ui-schema/generator.js";

/**
 * Result of building form schemas.
 */
export interface BuildResult {
  /** JSON Schema for validation */
  readonly jsonSchema: JSONSchema7;
  /** JSON Forms UI Schema for rendering */
  readonly uiSchema: UISchema;
}

/**
 * Builds both JSON Schema and UI Schema from a FormSpec.
 *
 * This is a convenience function that combines `generateJsonSchema`
 * and `generateUiSchema`.
 *
 * @example
 * ```typescript
 * const form = formspec(
 *   field.text("name", { required: true }),
 *   field.number("age", { min: 0 }),
 * );
 *
 * const { jsonSchema, uiSchema } = buildFormSchemas(form);
 *
 * // Use with JSON Forms renderer
 * <JsonForms
 *   schema={jsonSchema}
 *   uischema={uiSchema}
 *   data={formData}
 *   renderers={materialRenderers}
 * />
 * ```
 *
 * @param form - The FormSpec to build schemas from
 * @returns Object containing both jsonSchema and uiSchema
 */
export function buildFormSchemas<E extends readonly FormElement[]>(
  form: FormSpec<E>
): BuildResult {
  return {
    jsonSchema: generateJsonSchema(form),
    uiSchema: generateUiSchema(form),
  };
}
