/**
 * JSON Schema type definitions.
 *
 * These types are a subset of JSON Schema sufficient for form generation.
 */

/**
 * JSON Schema primitive types.
 *
 * @public
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
 * @public
 */
export interface JSONSchema7 {
  /** Declared JSON Schema dialect URI for the document root. */
  $schema?: string;
  /** Stable identifier for the schema document or sub-schema. */
  $id?: string;
  /** Reference to another schema location. */
  $ref?: string;

  // Metadata
  /** Human-readable title for the schema node. */
  title?: string;
  /** Human-readable description for the schema node. */
  description?: string;
  /** Whether the schema node is deprecated. */
  deprecated?: boolean;

  // Type
  /** JSON Schema type keyword for the current node. */
  type?: JSONSchemaType | JSONSchemaType[];

  // String validation
  /** Inclusive minimum string length. */
  minLength?: number;
  /** Inclusive maximum string length. */
  maxLength?: number;
  /** Regular expression pattern applied to string values. */
  pattern?: string;

  // Number validation
  /** Inclusive numeric lower bound. */
  minimum?: number;
  /** Inclusive numeric upper bound. */
  maximum?: number;
  /** Exclusive numeric lower bound. */
  exclusiveMinimum?: number;
  /** Exclusive numeric upper bound. */
  exclusiveMaximum?: number;

  // Enum
  /** Closed set of allowed scalar values. */
  enum?: readonly (string | number | boolean | null)[];
  /** Literal value the instance must equal. */
  const?: string | number | boolean | null;

  // Object
  /** Object properties keyed by property name. */
  properties?: Record<string, JSONSchema7>;
  /** Property names that must be present on object values. */
  required?: string[];
  /** Whether, or how, additional object properties are allowed. */
  additionalProperties?: boolean | JSONSchema7;

  // Array
  /** Item schema or tuple schemas applied to array elements. */
  items?: JSONSchema7 | JSONSchema7[];
  /** Inclusive minimum array length. */
  minItems?: number;
  /** Inclusive maximum array length. */
  maxItems?: number;

  // Composition
  /** Schemas that must all validate successfully. */
  allOf?: JSONSchema7[];
  /** Schemas of which at least one may validate successfully. */
  anyOf?: JSONSchema7[];
  /** Schemas of which exactly one should validate successfully. */
  oneOf?: JSONSchema7[];
  /** Schema that must not validate successfully. */
  not?: JSONSchema7;

  // Conditional
  /** Conditional branch predicate schema. */
  if?: JSONSchema7;
  /** Schema applied when the `if` branch matches. */
  then?: JSONSchema7;
  /** Schema applied when the `if` branch does not match. */
  else?: JSONSchema7;

  // Format
  /** Format hint for downstream validators and tooling. */
  format?: string;

  // Default
  /** Default value suggested for the schema node. */
  default?: unknown;

  // =============================================================================
  // FormSpec Extensions (x- prefixed)
  // =============================================================================

  /**
   * Data source key for dynamic enum fields.
   * Indicates that options should be fetched from a registered resolver.
   */
  "x-formspec-option-source"?: string;

  /**
   * Field names whose values are needed to fetch dynamic enum options.
   * Used for dependent/cascading dropdowns.
   */
  "x-formspec-option-source-params"?: readonly string[];

  /**
   * Schema source identifier for dynamic schema fields.
   * Indicates that the schema should be loaded dynamically at runtime.
   */
  "x-formspec-schema-source"?: string;
}

/**
 * Extension properties for custom FormSpec constraint tags.
 *
 * @public
 */
export type FormSpecSchemaExtensions = Record<`x-formspec-${string}`, unknown>;

/**
 * JSON Schema with FormSpec extension properties for arbitrary `x-formspec-*` keys.
 *
 * @public
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
