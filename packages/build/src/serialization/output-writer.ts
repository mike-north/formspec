/**
 * Output writer contracts for the serialization bounded context.
 *
 * Writers translate canonical FormIR or future inputs into concrete output
 * documents. PR-1 introduces the shape so JSON Schema output can move behind a
 * named serialization boundary before vocabulary transport is implemented.
 */

import type { FormSpecSerializationConfig } from "@formspec/config";

/**
 * Known output families, kept open for future internal or extension writers.
 * The string intersection permits custom kinds while keeping literal completions
 * for the known built-in output kinds.
 */
export type OutputKind = "data-schema" | "ui-schema" | (string & {});

/**
 * Shared serialization settings available to output writers and keyword
 * emitters.
 */
export interface SerializationContext {
  /** Vendor prefix used by extension transport, such as `x-formspec`. */
  readonly vendorPrefix: string;
  /** Default transport for registry entries that can use either transport. */
  readonly defaultTransport: "vocabulary" | "extension";
  /** Forward-looking configuration for PR-2 vocabulary and dialect URLs. */
  readonly serialization?: FormSpecSerializationConfig | undefined;
}

/**
 * Base class for output writers owned by the serialization bounded context.
 */
export abstract class OutputWriter<TInput, TOutput> {
  /** Output family produced by this writer. */
  abstract readonly outputKind: OutputKind;

  /** Emits a complete root document. */
  abstract emitDocument(input: TInput, ctx: SerializationContext): TOutput;

  /** Emits a reusable fragment without root-level document decoration. */
  abstract emitFragment(input: TInput, ctx: SerializationContext): TOutput;
}
