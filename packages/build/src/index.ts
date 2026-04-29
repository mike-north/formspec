/**
 * `@formspec/build` - Build tools for FormSpec
 *
 * This package provides generators to compile FormSpec forms into:
 * - JSON Schema 2020-12 (for validation)
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

import type { FormElement, FormSpec, LoggerLike } from "@formspec/core";
import { noopLogger } from "@formspec/core";
import { generateJsonSchema, type GenerateJsonSchemaOptions } from "./json-schema/generator.js";
import { generateUiSchema, type GenerateUiSchemaOptions } from "./ui-schema/generator.js";
import { type JsonSchema2020 } from "./json-schema/ir-generator.js";
import type { UISchema } from "./ui-schema/types.js";
import * as fs from "node:fs";
import * as path from "node:path";

// =============================================================================
// Type Exports
// =============================================================================

export type { JsonSchema2020 } from "./json-schema/ir-generator.js";
export type { GenerateJsonSchemaOptions } from "./json-schema/generator.js";
export type { GenerateUiSchemaOptions } from "./ui-schema/generator.js";
export type {
  BuiltinConstraintBroadeningRegistration,
  ConstraintTagRegistration,
  CustomAnnotationRegistration,
  CustomConstraintRegistration,
  CustomTypeRegistration,
  ExtensionDefinition,
  AnyField,
  ArrayField,
  BooleanField,
  Conditional,
  DynamicEnumField,
  DynamicSchemaField,
  EnumOption,
  EnumOptionValue,
  FormElement,
  FormSpec,
  Group,
  NumberField,
  ObjectField,
  StaticEnumField,
  TextField,
} from "@formspec/core";

export type {
  JSONSchema7,
  JSONSchemaType,
  ExtendedJSONSchema7,
  FormSpecSchemaExtensions,
} from "./json-schema/types.js";

export { createExtensionRegistry } from "./extensions/index.js";
export type {
  ExtensionRegistry,
  ExtensionTypeLookupResult,
  MutableExtensionRegistry,
} from "./extensions/index.js";
/**
 * A simplified setup-time diagnostic produced by extension-registry construction.
 *
 * Re-exported here because {@link ExtensionRegistry.setupDiagnostics} (an
 * `@internal` field on a `@public` interface) references this type directly.
 * API Extractor requires every type transitively referenced through a public
 * surface to be exported from the package entry point, even when the field
 * carrying it is marked `@internal`.
 *
 * @internal
 */
export type { SetupDiagnostic } from "@formspec/analysis/internal";
export type {
  DSLPolicy,
  FormSpecConfig,
  FormSpecPackageOverride,
  FormSpecSerializationConfig,
} from "@formspec/config";

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

export type {
  DetailedClassSchemasResult,
  DetailedSchemaGenerationTargetResult,
  DiscriminatorResolutionOptions,
  GenerateFromClassOptions,
  GenerateFromClassResult,
  GenerateSchemasOptions,
  GenerateSchemasBatchFromProgramOptions,
  GenerateSchemasBatchOptions,
  GenerateSchemasFromProgramOptions,
  SchemaGenerationTarget,
  StaticSchemaGenerationOptions,
} from "./generators/class-schema.js";
export type { StaticBuildContext } from "./static-build.js";
export type {
  ValidateIROptions,
  ValidationDiagnostic,
  ValidationDiagnosticLocation,
  ValidationDiagnosticSeverity,
  ValidationResult,
} from "./validate/index.js";
export type {
  DiscoveredTypeSchemas,
  GenerateSchemasFromDeclarationOptions,
  MetadataSourceDeclaration,
  GenerateSchemasFromParameterOptions,
  GenerateSchemasFromReturnTypeOptions,
  GenerateSchemasFromTypeOptions,
  ResolveDeclarationMetadataOptions,
  SchemaSourceDeclaration,
} from "./generators/discovered-schema.js";
export type {
  BuildMixedAuthoringSchemasOptions,
  MixedAuthoringSchemas,
} from "./generators/mixed-authoring.js";

// =============================================================================
// Zod Validation Schemas
// =============================================================================

export { jsonSchema7Schema } from "./json-schema/schema.js";
export { uiSchema as uiSchemaSchema } from "./ui-schema/schema.js";

// =============================================================================
// Chain DSL Generators
// =============================================================================

export { generateJsonSchema } from "./json-schema/generator.js";
export { generateUiSchema } from "./ui-schema/generator.js";
export {
  generateSchemasBatch,
  generateSchemasBatchFromProgram,
  generateSchemasFromClass,
} from "./generators/class-schema.js";
// eslint-disable-next-line @typescript-eslint/no-deprecated
export { generateSchemas } from "./generators/class-schema.js";
// eslint-disable-next-line @typescript-eslint/no-deprecated
export { generateSchemasFromProgram } from "./generators/class-schema.js";
/* eslint-disable @typescript-eslint/no-deprecated */
export {
  generateSchemasDetailed,
  generateSchemasFromProgramDetailed,
} from "./generators/class-schema.js";
/* eslint-enable @typescript-eslint/no-deprecated */
export {
  createStaticBuildContext,
  createStaticBuildContextFromProgram,
  resolveModuleExport,
  resolveModuleExportDeclaration,
} from "./static-build.js";
export {
  generateSchemasFromDeclaration,
  generateSchemasFromParameter,
  generateSchemasFromReturnType,
  generateSchemasFromType,
  resolveDeclarationMetadata,
} from "./generators/discovered-schema.js";
export { buildMixedAuthoringSchemas } from "./generators/mixed-authoring.js";

/**
 * Result of building form schemas.
 *
 * @public
 */
export interface BuildResult {
  /** JSON Schema 2020-12 for validation */
  readonly jsonSchema: JsonSchema2020;
  /** JSON Forms UI Schema for rendering */
  readonly uiSchema: UISchema;
}

/**
 * Options for building schemas from a FormSpec.
 *
 * Currently identical to `GenerateJsonSchemaOptions`. Defined separately so the
 * Chain DSL surface can grow independently in the future if needed.
 *
 * @public
 */
export interface BuildFormSchemasOptions
  extends GenerateJsonSchemaOptions, GenerateUiSchemaOptions {
  /**
   * Optional logger for diagnostic output. Defaults to a no-op logger so
   * existing callers produce no output.
   */
  readonly logger?: LoggerLike | undefined;
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
 *
 * @public
 */
export function buildFormSchemas<E extends readonly FormElement[]>(
  form: FormSpec<E>,
  options?: BuildFormSchemasOptions
): BuildResult {
  const logger = options?.logger ?? noopLogger;
  logger.debug("buildFormSchemas: starting schema generation");
  return {
    jsonSchema: generateJsonSchema(form, options),
    uiSchema: generateUiSchema(form, options),
  };
}

/**
 * Options for writing schemas to disk.
 *
 * @public
 */
export interface WriteSchemasOptions extends GenerateJsonSchemaOptions {
  /** Output directory for the schema files */
  readonly outDir: string;
  /** Base name for the output files (without extension). Defaults to "schema" */
  readonly name?: string;
  /** Number of spaces for JSON indentation. Defaults to 2 */
  readonly indent?: number;
  /**
   * Optional logger for diagnostic output. Defaults to a no-op logger so
   * existing callers produce no output.
   */
  readonly logger?: LoggerLike | undefined;
}

/**
 * Result of writing schemas to disk.
 *
 * @public
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
 *
 * @public
 */
export function writeSchemas<E extends readonly FormElement[]>(
  form: FormSpec<E>,
  options: WriteSchemasOptions
): WriteSchemasResult {
  const {
    outDir,
    name = "schema",
    indent = 2,
    vendorPrefix,
    enumSerialization,
    metadata,
    logger: rawLogger,
  } = options;
  const logger = (rawLogger ?? noopLogger).child({ stage: "write" });

  // Build schemas
  const buildOptions =
    vendorPrefix === undefined && enumSerialization === undefined && metadata === undefined
      ? { logger: rawLogger }
      : {
          ...(vendorPrefix !== undefined && { vendorPrefix }),
          ...(enumSerialization !== undefined && { enumSerialization }),
          ...(metadata !== undefined && { metadata }),
          logger: rawLogger,
        };

  const { jsonSchema, uiSchema } = buildFormSchemas(form, buildOptions);

  // Ensure output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Write files
  const jsonSchemaPath = path.join(outDir, `${name}-schema.json`);
  const uiSchemaPath = path.join(outDir, `${name}-uischema.json`);

  logger.debug("writing JSON Schema", { path: jsonSchemaPath });
  fs.writeFileSync(jsonSchemaPath, JSON.stringify(jsonSchema, null, indent));
  logger.debug("writing UI Schema", { path: uiSchemaPath });
  fs.writeFileSync(uiSchemaPath, JSON.stringify(uiSchema, null, indent));

  return { jsonSchemaPath, uiSchemaPath };
}
