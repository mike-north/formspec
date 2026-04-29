/**
 * JSON Schema 2020-12 writer for the serialization bounded context.
 *
 * PR-1 keeps the existing generator as the implementation and introduces this
 * writer as the internal class-hierarchy precedent. PR-2 can add root dialect
 * decoration here without changing call sites.
 */

import type { FormIR } from "@formspec/core/internals";
import type { ExtensionRegistry } from "../extensions/index.js";
import {
  generateJsonSchemaFromIR,
  type GenerateJsonSchemaFromIROptions,
  type JsonSchema2020,
} from "../json-schema/ir-generator.js";
import { OutputWriter, type OutputKind, type SerializationContext } from "./output-writer.js";

/** Generator options the JSON Schema writer must preserve while emitting. */
export interface JsonSchema2020WriterOptions {
  /** Registry used for custom types, constraints, and annotations. */
  readonly extensionRegistry?: ExtensionRegistry | undefined;
  /** JSON Schema representation to use for static enums. */
  readonly enumSerialization?: GenerateJsonSchemaFromIROptions["enumSerialization"] | undefined;
}

/** JSON Schema 2020-12 writer over canonical FormIR. */
export class JsonSchema2020Writer extends OutputWriter<FormIR, JsonSchema2020> {
  override readonly outputKind: OutputKind = "data-schema";

  constructor(private readonly options: JsonSchema2020WriterOptions = {}) {
    super();
  }

  override emitDocument(input: FormIR, ctx: SerializationContext): JsonSchema2020 {
    if (ctx.defaultTransport !== "extension") {
      throw new Error(
        "Vocabulary transport for JSON Schema 2020-12 output is not implemented in PR-1."
      );
    }

    return generateJsonSchemaFromIR(input, {
      ...this.options,
      vendorPrefix: ctx.vendorPrefix,
      serialization: ctx.serialization,
    });
  }

  override emitFragment(input: FormIR, ctx: SerializationContext): JsonSchema2020 {
    if (ctx.defaultTransport !== "extension") {
      throw new Error(
        "Vocabulary transport for JSON Schema 2020-12 output is not implemented in PR-1."
      );
    }

    return generateJsonSchemaFromIR(input, {
      ...this.options,
      vendorPrefix: ctx.vendorPrefix,
      serialization: ctx.serialization,
    });
  }
}
