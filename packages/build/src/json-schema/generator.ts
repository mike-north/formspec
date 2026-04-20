/**
 * JSON Schema generator for FormSpec forms.
 *
 * Routes through the canonical IR pipeline: Chain DSL → FormIR → JSON Schema 2020-12.
 */

import type { FormElement, FormSpec, LoggerLike, MetadataPolicyInput } from "@formspec/core";
import { noopLogger } from "@formspec/core";
import { canonicalizeChainDSL } from "../canonicalize/index.js";
import {
  generateJsonSchemaFromIR,
  type GenerateJsonSchemaFromIROptions,
  type JsonSchema2020,
} from "./ir-generator.js";

/**
 * Options for generating JSON Schema from a Chain DSL form.
 *
 * @public
 */
export interface GenerateJsonSchemaOptions {
  /**
   * Vendor prefix for emitted extension keywords.
   * @defaultValue "x-formspec"
   */
  readonly vendorPrefix?: string | undefined;
  /**
   * JSON Schema representation to use for static enums.
   * @defaultValue "enum"
   */
  readonly enumSerialization?: "enum" | "oneOf" | "smart-size";
  /** Metadata resolution policy for chain DSL generation. */
  readonly metadata?: MetadataPolicyInput | undefined;
  /**
   * Optional logger for diagnostic output. Defaults to a no-op logger so
   * existing callers produce no output.
   */
  readonly logger?: LoggerLike | undefined;
}

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
 *
 * @public
 */
export function generateJsonSchema<E extends readonly FormElement[]>(
  form: FormSpec<E>,
  options?: GenerateJsonSchemaOptions
): JsonSchema2020 {
  const logger = (options?.logger ?? noopLogger).child({ stage: "ir" });
  const metadata = options?.metadata;
  const vendorPrefix = options?.vendorPrefix;
  const enumSerialization = options?.enumSerialization;
  logger.debug("canonicalizing chain DSL to IR");
  const ir = canonicalizeChainDSL(form, metadata !== undefined ? { metadata } : undefined);
  const schemaLogger = (options?.logger ?? noopLogger).child({ stage: "schema" });
  schemaLogger.debug("generating JSON Schema from IR");
  const internalOptions: GenerateJsonSchemaFromIROptions | undefined =
    vendorPrefix === undefined && enumSerialization === undefined
      ? undefined
      : {
          ...(vendorPrefix !== undefined && { vendorPrefix }),
          ...(enumSerialization !== undefined && { enumSerialization }),
        };
  return generateJsonSchemaFromIR(ir, internalOptions);
}
