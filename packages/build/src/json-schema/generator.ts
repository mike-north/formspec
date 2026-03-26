/**
 * JSON Schema generator for FormSpec forms.
 *
 * Routes through the canonical IR pipeline: Chain DSL → FormIR → JSON Schema 2020-12.
 */

import type { FormElement, FormSpec } from "@formspec/core";
import { canonicalizeChainDSL } from "../canonicalize/index.js";
import {
  generateJsonSchemaFromIR,
  type GenerateJsonSchemaFromIROptions,
  type JsonSchema2020,
} from "./ir-generator.js";

/**
 * Options for generating JSON Schema from a Chain DSL form.
 *
 * These options are forwarded to the IR-based JSON Schema generator.
 */
export type GenerateJsonSchemaOptions = GenerateJsonSchemaFromIROptions;

/**
 * Generates a JSON Schema 2020-12 from a FormSpec.
 *
 * All generation routes through the canonical IR. The chain DSL is first
 * canonicalized to a FormIR, then the IR-based generator produces the schema.
 *
 * @example
 * ```typescript
 * const form = formspec(
 *   field.text("name", { label: "Name", required: true }),
 *   field.number("age", { min: 0 }),
 * );
 *
 * const schema = generateJsonSchema(form);
 * // {
 * //   $schema: "https://json-schema.org/draft/2020-12/schema",
 * //   type: "object",
 * //   properties: {
 * //     name: { type: "string", title: "Name" },
 * //     age: { type: "number", minimum: 0 }
 * //   },
 * //   required: ["name"]
 * // }
 * ```
 *
 * @param form - The FormSpec to convert
 * @returns A JSON Schema 2020-12 object
 */
export function generateJsonSchema<E extends readonly FormElement[]>(
  form: FormSpec<E>,
  options?: GenerateJsonSchemaOptions
): JsonSchema2020 {
  const ir = canonicalizeChainDSL(form);
  return generateJsonSchemaFromIR(ir, options);
}
