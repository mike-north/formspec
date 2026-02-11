/**
 * Browser-safe exports for `@formspec/build`.
 *
 * This entry point excludes Node.js-specific functions like `writeSchemas`
 * that use `node:fs` and `node:path`, making it suitable for browser environments.
 *
 * @example
 * ```typescript
 * // In browser code (e.g., playground)
 * import { buildFormSchemas, generateJsonSchema, generateUiSchema } from "@formspec/build/browser";
 *
 * const form = formspec(field.text("name"));
 * const { jsonSchema, uiSchema } = buildFormSchemas(form);
 * ```
 *
 * @packageDocumentation
 */

import type { FormElement, FormSpec } from "@formspec/core";
import { generateJsonSchema } from "./json-schema/generator.js";
import { generateUiSchema } from "./ui-schema/generator.js";

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
  readonly jsonSchema: ReturnType<typeof generateJsonSchema>;
  /** JSON Forms UI Schema for rendering */
  readonly uiSchema: ReturnType<typeof generateUiSchema>;
}

/**
 * Builds both JSON Schema and UI Schema from a FormSpec.
 *
 * This is a browser-safe version that does not include file system operations.
 *
 * @example
 * ```typescript
 * const form = formspec(
 *   field.text("name", { required: true }),
 *   field.number("age", { min: 0 }),
 * );
 *
 * const { jsonSchema, uiSchema } = buildFormSchemas(form);
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
