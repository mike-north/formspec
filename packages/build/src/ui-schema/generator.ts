/**
 * JSON Forms UI Schema generator for FormSpec forms.
 *
 * Routes through the canonical IR pipeline: Chain DSL → FormIR → UI Schema.
 */

import type { FormElement, FormSpec, LoggerLike, MetadataPolicyInput } from "@formspec/core";
import { noopLogger } from "@formspec/core";
import { canonicalizeChainDSL } from "../canonicalize/index.js";
import { generateUiSchemaFromIR } from "./ir-generator.js";
import type { UISchema } from "./types.js";

/**
 * Options for generating a UI Schema from a Chain DSL form.
 *
 * @public
 */
export interface GenerateUiSchemaOptions {
  /** Metadata resolution policy for chain DSL UI generation. */
  readonly metadata?: MetadataPolicyInput | undefined;
  /**
   * Optional logger for diagnostic output. Defaults to a no-op logger so
   * existing callers produce no output.
   */
  readonly logger?: LoggerLike | undefined;
}

/**
 * Generates a JSON Forms UI Schema from a FormSpec.
 *
 * All generation routes through the canonical IR. The chain DSL is first
 * canonicalized to a FormIR, then the IR-based generator produces the schema.
 *
 * @example
 * ```typescript
 * const form = formspec(
 *   group("Customer",
 *     field.text("name", { label: "Name" }),
 *   ),
 *   when("status", "draft",
 *     field.text("notes", { label: "Notes" }),
 *   ),
 * );
 *
 * const uiSchema = generateUiSchema(form);
 * // {
 * //   type: "VerticalLayout",
 * //   elements: [
 * //     {
 * //       type: "Group",
 * //       label: "Customer",
 * //       elements: [
 * //         { type: "Control", scope: "#/properties/name", label: "Name" }
 * //       ]
 * //     },
 * //     {
 * //       type: "Control",
 * //       scope: "#/properties/notes",
 * //       label: "Notes",
 * //       rule: {
 * //         effect: "SHOW",
 * //         condition: { scope: "#/properties/status", schema: { const: "draft" } }
 * //       }
 * //     }
 * //   ]
 * // }
 * ```
 *
 * @param form - The FormSpec to convert
 * @returns A JSON Forms UI Schema
 *
 * @public
 */
export function generateUiSchema<E extends readonly FormElement[]>(
  form: FormSpec<E>,
  options?: GenerateUiSchemaOptions
): UISchema {
  const logger = (options?.logger ?? noopLogger).child({ stage: "ir" });
  logger.debug("canonicalizing chain DSL to IR for UI Schema generation");
  const ir = canonicalizeChainDSL(
    form,
    options?.metadata !== undefined ? { metadata: options.metadata } : undefined
  );
  const schemaLogger = (options?.logger ?? noopLogger).child({ stage: "schema" });
  schemaLogger.debug("generating UI Schema from IR");
  return generateUiSchemaFromIR(ir);
}
