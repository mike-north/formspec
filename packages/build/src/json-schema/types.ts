/**
 * JSON Schema Draft-07 type definitions.
 *
 * These types are a subset of JSON Schema sufficient for form generation.
 */

/**
 * JSON Schema primitive types.
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
 * A JSON Schema definition (draft-07 subset).
 */
export interface JSONSchema7 {
  $schema?: string;
  $id?: string;
  $ref?: string;

  // Metadata
  title?: string;
  description?: string;

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
