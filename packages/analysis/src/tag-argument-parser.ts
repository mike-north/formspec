import type { JsonValue } from "@formspec/core/internals";

/**
 * Discriminates between "build" (compile-time via tsdoc-parser.ts) and
 * "snapshot" (runtime via file-snapshots.ts) lowering contexts.
 *
 * Phase 1 implementations treat this as a no-op; it is accepted here for
 * forward-compatibility with Phase 2/3 consumer wiring.
 */
export type TagArgumentLowering = "build" | "snapshot";

/**
 * The strongly-typed result of a successful tag-argument parse.
 *
 * Each variant maps to a distinct constraint-tag semantic:
 * - `number`  — numeric constraints (minimum, maximum, …)
 * - `string`  — string/pattern constraints
 * - `boolean` — flag constraints
 * - `marker`  — presence-only constraints (@uniqueItems)
 * - `json-array` — array-valued constraints (@enumOptions)
 * - `json-value` — arbitrary JSON constraints
 * - `raw-string-fallback` — @const with a non-JSON literal value
 */
export type TagArgumentValue =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "marker" } // for @uniqueItems — empty or "true"
  | { readonly kind: "json-array"; readonly value: readonly JsonValue[] }
  | { readonly kind: "json-value"; readonly value: JsonValue }
  | { readonly kind: "raw-string-fallback"; readonly value: string }; // @const only

/** Diagnostic codes emitted by {@link parseTagArgument}. */
export const TAG_ARGUMENT_DIAGNOSTIC_CODES = {
  INVALID_TAG_ARGUMENT: "INVALID_TAG_ARGUMENT",
  MISSING_TAG_ARGUMENT: "MISSING_TAG_ARGUMENT",
  UNKNOWN_TAG: "UNKNOWN_TAG",
} as const;

export type TagArgumentDiagnosticCode =
  (typeof TAG_ARGUMENT_DIAGNOSTIC_CODES)[keyof typeof TAG_ARGUMENT_DIAGNOSTIC_CODES];

export interface TagArgumentDiagnostic {
  readonly code: TagArgumentDiagnosticCode;
  /**
   * Messages for INVALID_TAG_ARGUMENT must start with "Expected " so that the
   * "Expected"-based classifier in `packages/analysis/src/file-snapshots.ts`
   * (~line 1480) remains valid when consumer wiring lands in Phase 2/3.
   */
  readonly message: string;
}

/** The result type returned by {@link parseTagArgument}. */
export type TagArgumentParseResult =
  | { readonly ok: true; readonly value: TagArgumentValue }
  | { readonly ok: false; readonly diagnostic: TagArgumentDiagnostic };

/**
 * Constraint-tag parsing families. Each family shares a common argument
 * structure and is implemented by a dedicated parser in Slices A/B/C.
 */
export type TagFamily =
  | "numeric"
  | "length"
  | "boolean-marker"
  | "string-opaque"
  | "json-array"
  | "json-value-with-fallback";

/**
 * Maps every built-in constraint-tag name (no leading "@") to its parsing
 * family. Unknown tag names return `undefined` at runtime; the parser returns
 * an `UNKNOWN_TAG` diagnostic in that case.
 */
export const TAG_ARGUMENT_FAMILIES: Readonly<Record<string, TagFamily>> = {
  minimum: "numeric",
  maximum: "numeric",
  exclusiveMinimum: "numeric",
  exclusiveMaximum: "numeric",
  multipleOf: "numeric",
  minLength: "length",
  maxLength: "length",
  minItems: "length",
  maxItems: "length",
  uniqueItems: "boolean-marker",
  pattern: "string-opaque",
  enumOptions: "json-array",
  const: "json-value-with-fallback",
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Throws a clearly-labelled "not-implemented" error for a tag family.
 * Slices A, B, and C replace this throw with real implementations.
 *
 * @param family - the family whose parser has not yet been implemented
 */
function throwNotImplemented(family: TagFamily): never {
  throw new Error(`not-implemented: tag family "${family}" parser (Slice A/B/C)`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses a single constraint-tag argument literal. Role C of the
 * synthetic-checker retirement plan §1.
 *
 * @param tagName - normalized tag name (no leading "@")
 * @param rawArgumentText - argument text AFTER parseTagSyntax has stripped
 *                          any path-target prefix (i.e. "effectiveText")
 * @param lowering - build vs snapshot. Phase 1 implementations may treat
 *                   this as a no-op; the parameter is accepted for
 *                   forward-compatibility with Phase 2/3 consumer wiring.
 */
export function parseTagArgument(
  tagName: string,
  rawArgumentText: string,
  lowering: TagArgumentLowering,
): TagArgumentParseResult {
  // Suppress unused-parameter lint — `lowering` is intentionally accepted for
  // Phase 2/3 forward-compatibility even though Phase 1 does not use it.
  void lowering;

  const family: TagFamily | undefined = TAG_ARGUMENT_FAMILIES[tagName];

  if (family === undefined) {
    return {
      ok: false,
      diagnostic: {
        code: TAG_ARGUMENT_DIAGNOSTIC_CODES.UNKNOWN_TAG,
        message: `Unknown constraint tag "${tagName}".`,
      },
    };
  }

  // Exhaustive switch — TypeScript's `never` check ensures all families are
  // handled. Slices A, B, C replace the throwNotImplemented calls.
  switch (family) {
    case "numeric":
      return throwNotImplemented(family);
    case "length":
      return throwNotImplemented(family);
    case "boolean-marker":
      return throwNotImplemented(family);
    case "string-opaque":
      return throwNotImplemented(family);
    case "json-array":
      return throwNotImplemented(family);
    case "json-value-with-fallback":
      return throwNotImplemented(family);
    default: {
      // Exhaustiveness guard: if a new TagFamily variant is added without
      // updating this switch, the compiler will flag the assignment below.
      const _exhaustiveCheck: never = family;
      throw new Error(`Unexpected tag family: ${String(_exhaustiveCheck)}`);
    }
  }
}
