/**
 * Zod schemas for JSON Schema output validation.
 *
 * These schemas cover the subset of JSON Schema that FormSpec generates,
 * plus the FormSpec-specific `x-formspec-*` extension properties.
 *
 * @see https://json-schema.org/draft/2020-12/schema
 */

import { z } from "zod";
import type { JSONSchema7 } from "./types.js";

// =============================================================================
// JSON Schema type enum
// =============================================================================

/**
 * Zod schema for JSON Schema primitive type strings.
 *
 * @public
 */
export const jsonSchemaTypeSchema = z.enum([
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
  "null",
]);

// =============================================================================
// JSON Schema validator schema (recursive)
// =============================================================================

// We annotate with z.ZodType<JSONSchema7> for the recursive self-reference.
// The @ts-expect-error is required because exactOptionalPropertyTypes:true causes
// Zod's inferred output type for optional fields (`T | undefined`) to be
// incompatible with the JSONSchema7 interface's exact optional fields (`T?`).
// The runtime behavior is correct: z.optional() will strip `undefined` values
// during parsing and correctly handle absent keys.
//
/**
 * Zod schema for the legacy JSON Schema 7 subset used by `@formspec/build`.
 *
 * @public
 */
// @ts-expect-error -- exactOptionalPropertyTypes: Zod optional infers `T | undefined`
// but JSONSchema7 uses exact optional `?:` which disallows explicit undefined.
export const jsonSchema7Schema: z.ZodType<JSONSchema7> = z.lazy(() =>
  z
    .object({
      $schema: z.string().optional(),
      $id: z.string().optional(),
      $ref: z.string().optional(),

      // Metadata
      title: z.string().optional(),
      description: z.string().optional(),
      deprecated: z.boolean().optional(),

      // Type
      type: z.union([jsonSchemaTypeSchema, z.array(jsonSchemaTypeSchema)]).optional(),

      // String validation
      minLength: z.number().optional(),
      maxLength: z.number().optional(),
      pattern: z.string().optional(),

      // Number validation
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      exclusiveMinimum: z.number().optional(),
      exclusiveMaximum: z.number().optional(),

      // Enum
      enum: z
        .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
        .readonly()
        .optional(),
      const: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),

      // Object
      properties: z.record(z.string(), jsonSchema7Schema).optional(),
      required: z.array(z.string()).optional(),
      additionalProperties: z.union([z.boolean(), jsonSchema7Schema]).optional(),

      // Array
      items: z.union([jsonSchema7Schema, z.array(jsonSchema7Schema)]).optional(),
      minItems: z.number().optional(),
      maxItems: z.number().optional(),

      // Composition
      allOf: z.array(jsonSchema7Schema).optional(),
      anyOf: z.array(jsonSchema7Schema).optional(),
      oneOf: z.array(jsonSchema7Schema).optional(),
      not: jsonSchema7Schema.optional(),

      // Conditional
      if: jsonSchema7Schema.optional(),
      then: jsonSchema7Schema.optional(),
      else: jsonSchema7Schema.optional(),

      // Format
      format: z.string().optional(),

      // Default
      default: z.unknown().optional(),

      // FormSpec extensions
      "x-formspec-option-source": z.string().optional(),
      "x-formspec-option-source-params": z.array(z.string()).readonly().optional(),
      "x-formspec-schema-source": z.string().optional(),
    })
    // passthrough preserves arbitrary x-formspec-* extension properties
    // added by custom constraint tags without causing validation failures
    .passthrough()
);
