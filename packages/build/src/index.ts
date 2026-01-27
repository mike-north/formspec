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
import * as fs from "node:fs";
import * as path from "node:path";

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

/**
 * Options for writing schemas to disk.
 */
export interface WriteSchemasOptions {
  /** Output directory for the schema files */
  readonly outDir: string;
  /** Base name for the output files (without extension). Defaults to "schema" */
  readonly name?: string;
  /** Number of spaces for JSON indentation. Defaults to 2 */
  readonly indent?: number;
}

/**
 * Result of writing schemas to disk.
 */
export interface WriteSchemasResult {
  /** Path to the generated JSON Schema file */
  readonly jsonSchemaPath: string;
  /** Path to the generated UI Schema file */
  readonly uiSchemaPath: string;
}

/**
 * Builds and writes both JSON Schema and UI Schema files to disk.
 *
 * This is a convenience function for build-time schema generation.
 * It creates the output directory if it doesn't exist.
 *
 * @example
 * ```typescript
 * import { formspec, field } from "formspec";
 * import { writeSchemas } from "@formspec/build";
 *
 * const ProductForm = formspec(
 *   field.text("name", { required: true }),
 *   field.enum("status", ["draft", "active"]),
 * );
 *
 * // Write schemas to ./generated/product-schema.json and ./generated/product-uischema.json
 * const { jsonSchemaPath, uiSchemaPath } = writeSchemas(ProductForm, {
 *   outDir: "./generated",
 *   name: "product",
 * });
 *
 * console.log(`Generated: ${jsonSchemaPath}, ${uiSchemaPath}`);
 * ```
 *
 * @param form - The FormSpec to build schemas from
 * @param options - Output options (directory, file name, indentation)
 * @returns Object containing paths to the generated files
 */
export function writeSchemas<E extends readonly FormElement[]>(
  form: FormSpec<E>,
  options: WriteSchemasOptions
): WriteSchemasResult {
  const { outDir, name = "schema", indent = 2 } = options;

  // Build schemas
  const { jsonSchema, uiSchema } = buildFormSchemas(form);

  // Ensure output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Write files
  const jsonSchemaPath = path.join(outDir, `${name}-schema.json`);
  const uiSchemaPath = path.join(outDir, `${name}-uischema.json`);

  fs.writeFileSync(jsonSchemaPath, JSON.stringify(jsonSchema, null, indent));
  fs.writeFileSync(uiSchemaPath, JSON.stringify(uiSchema, null, indent));

  return { jsonSchemaPath, uiSchemaPath };
}
