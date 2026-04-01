/**
 * JSON Schema type definitions.
 *
 * These types are a subset of JSON Schema sufficient for form generation.
 */

/**
 * JSON Schema primitive types.
 *
 * @beta
 */
export type JSONSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array"
  | "null";

/**
 * A JSON Schema definition (legacy subset used by Zod validator and types.ts).
 *
 * @beta
 */
export interface JSONSchema7 {
  $schema?: string;
  $id?: string;
  $ref?: string;

  // Metadata
  title?: string;
  description?: string;
  deprecated?: boolean;

  // Type
  type?: JSONSchemaType | JSONSchemaType[];

  // String validation
  minLength?: number;
  maxLength?: number;
  pattern?: string;

  // Number validation
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;

  // Enum
  enum?: readonly (string | number | boolean | null)[];
  const?: string | number | boolean | null;

  // Object
  properties?: Record<string, JSONSchema7>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema7;

  // Array
  items?: JSONSchema7 | JSONSchema7[];
  minItems?: number;
  maxItems?: number;

  // Composition
  allOf?: JSONSchema7[];
  anyOf?: JSONSchema7[];
  oneOf?: JSONSchema7[];
  not?: JSONSchema7;

  // Conditional
  if?: JSONSchema7;
  then?: JSONSchema7;
  else?: JSONSchema7;

  // Format
  format?: string;

  // Default
  default?: unknown;

  // =============================================================================
  // FormSpec Extensions (x- prefixed)
  // =============================================================================

  /**
   * Data source key for dynamic enum fields.
   * Indicates that options should be fetched from a registered resolver.
   */
  "x-formspec-source"?: string;

  /**
   * Field names whose values are needed to fetch dynamic enum options.
   * Used for dependent/cascading dropdowns.
   */
  "x-formspec-params"?: readonly string[];

  /**
   * Schema source identifier for dynamic schema fields.
   * Indicates that the schema should be loaded dynamically at runtime.
   */
  "x-formspec-schemaSource"?: string;
}

/**
 * Extension properties for custom FormSpec constraint tags.
 *
 * @beta
 */
export type FormSpecSchemaExtensions = Record<`x-formspec-${string}`, unknown>;

/**
 * JSON Schema with FormSpec extension properties for arbitrary `x-formspec-*` keys.
 *
 * @beta
 */
export type ExtendedJSONSchema7 = JSONSchema7 & FormSpecSchemaExtensions;

/**
 * Sets a FormSpec extension property on a JSON Schema node.
 *
 * Use this to safely add `x-formspec-*` properties to any schema,
 * including nested schemas typed as `JSONSchema7` (which don't carry
 * the extension index signature).
 *
 * @param schema - Any JSON Schema node
 * @param key - Extension key (must start with `x-formspec-`)
 * @param value - Extension value
 *
 * @internal
 */
export function setSchemaExtension(
  schema: object,
  key: `x-formspec-${string}`,
  value: unknown
): void {
  (schema as Record<string, unknown>)[key] = value;
}

/**
 * Reads a FormSpec extension property from a JSON Schema node.
 *
 * Accepts any schema object — `JSONSchema7`, `JsonSchema2020`, `ExtendedJSONSchema7`, etc.
 *
 * @param schema - Any JSON Schema node
 * @param key - Extension key (must start with `x-formspec-`)
 * @returns The extension value, or `undefined` if not present
 *
 * @internal
 */
export function getSchemaExtension(schema: object, key: `x-formspec-${string}`): unknown {
  return (schema as Record<string, unknown>)[key];
}
