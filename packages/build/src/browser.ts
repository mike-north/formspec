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
import { generateJsonSchema, type GenerateJsonSchemaOptions } from "./json-schema/generator.js";
import { generateUiSchema } from "./ui-schema/generator.js";
import { type JsonSchema2020 } from "./json-schema/ir-generator.js";
import type { UISchema } from "./ui-schema/types.js";

// Re-export types
export type { JsonSchema2020 } from "./json-schema/ir-generator.js";
export type { GenerateJsonSchemaFromIROptions } from "./json-schema/ir-generator.js";
export type { GenerateJsonSchemaOptions } from "./json-schema/generator.js";
export type {
  BuiltinConstraintBroadeningRegistration,
  ConstraintTagRegistration,
  CustomAnnotationRegistration,
  CustomConstraintRegistration,
  CustomTypeRegistration,
  ExtensionDefinition,
} from "@formspec/core";

export type {
  JSONSchema7,
  JSONSchemaType,
  ExtendedJSONSchema7,
  FormSpecSchemaExtensions,
} from "./json-schema/types.js";

export { setSchemaExtension, getSchemaExtension } from "./json-schema/types.js";
export { createExtensionRegistry } from "./extensions/index.js";
export type { ExtensionRegistry } from "./extensions/index.js";

export type {
  UISchema,
  UISchemaElement,
  UISchemaElementBase,
  UISchemaElementType,
  ControlElement,
  VerticalLayout,
  HorizontalLayout,
  GroupLayout,
  Categorization,
  Category,
  LabelElement,
  Rule,
  RuleEffect,
  RuleConditionSchema,
  SchemaBasedCondition,
} from "./ui-schema/types.js";

// Zod validation schemas
export {
  ruleEffectSchema,
  uiSchemaElementTypeSchema,
  ruleConditionSchema,
  schemaBasedConditionSchema,
  ruleSchema,
  controlSchema,
  verticalLayoutSchema,
  horizontalLayoutSchema,
  groupLayoutSchema,
  categorizationSchema,
  categorySchema,
  labelElementSchema,
  uiSchemaElementSchema,
  uiSchema as uiSchemaSchema,
} from "./ui-schema/schema.js";

export { jsonSchemaTypeSchema, jsonSchema7Schema } from "./json-schema/schema.js";

// Re-export individual generators
export { generateJsonSchema } from "./json-schema/generator.js";
export { generateJsonSchemaFromIR } from "./json-schema/ir-generator.js";
export { generateUiSchema } from "./ui-schema/generator.js";

// IR canonicalization (browser-safe: no Node.js dependencies)
export { canonicalizeChainDSL } from "./canonicalize/chain-dsl-canonicalizer.js";

// IR validation (browser-safe: no Node.js dependencies)
export { validateIR } from "./validate/constraint-validator.js";
export type {
  ValidationDiagnostic,
  ValidationResult,
  ValidateIROptions,
} from "./validate/constraint-validator.js";

/**
 * Result of building form schemas.
 */
export interface BuildResult {
  /** JSON Schema 2020-12 for validation */
  readonly jsonSchema: JsonSchema2020;
  /** JSON Forms UI Schema for rendering */
  readonly uiSchema: UISchema;
}

/**
 * Options for building schemas from a FormSpec in browser-safe code.
 *
 * Currently identical to `GenerateJsonSchemaOptions`. Defined separately so the
 * browser-safe surface can grow independently in the future if needed.
 */
export type BuildFormSchemasOptions = GenerateJsonSchemaOptions;

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
  form: FormSpec<E>,
  options?: BuildFormSchemasOptions
): BuildResult {
  return {
    jsonSchema: generateJsonSchema(form, options),
    uiSchema: generateUiSchema(form, options),
  };
}
