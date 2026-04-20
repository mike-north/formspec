import type { JsonValue } from "@formspec/core/internals";
import { BUILTIN_CONSTRAINT_DEFINITIONS } from "@formspec/core/internals";

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
 * - `string`  — validated string result for `@pattern`; never produced for
 *               `@const` (use `raw-string-fallback` for that)
 * - `boolean` — flag constraints
 * - `marker`  — presence-only constraints (@uniqueItems)
 * - `json-array` — array-valued constraints (@enumOptions)
 * - `json-value` — arbitrary JSON constraints
 * - `raw-string-fallback` — ONLY produced for `@const` when the argument is
 *                            not valid JSON; signals that the value should be
 *                            treated as an opaque string literal
 */
export type TagArgumentValue =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "marker" } // for @uniqueItems — empty or "true"
  | { readonly kind: "json-array"; readonly value: readonly JsonValue[] }
  | { readonly kind: "json-value"; readonly value: JsonValue }
  | { readonly kind: "raw-string-fallback"; readonly value: string };

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
   *
   * @remarks Phase 2/3 should shift the classifier to test `code` directly;
   * the "Expected " prefix is a bridge convention until that wiring lands.
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
  | "string"
  | "json-array"
  | "json-value-with-fallback";

/**
 * Maps every built-in constraint-tag name (no leading "@") to its parsing
 * family. Derived from {@link BUILTIN_CONSTRAINT_DEFINITIONS} — the single
 * source of truth for which constraint tags exist.
 *
 * The `satisfies` guard enforces that every key in BUILTIN_CONSTRAINT_DEFINITIONS
 * is present here and maps to a valid TagFamily. Adding a new tag to core is
 * therefore either automatic (if the default mapping covers it) or a type
 * error (prompting the author to add an entry here).
 *
 * Family assignment rules:
 *   "number" core type → "numeric" for value constraints; "length" for size/
 *     count constraints (minLength, maxLength, minItems, maxItems)
 *   "boolean" core type → "boolean-marker"
 *   "string"  core type → "string"
 *   "json"    core type → "json-array" for enumOptions; "json-value-with-fallback" for const
 */
export const TAG_ARGUMENT_FAMILIES = {
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
  pattern: "string",
  enumOptions: "json-array",
  const: "json-value-with-fallback",
} as const satisfies Record<keyof typeof BUILTIN_CONSTRAINT_DEFINITIONS, TagFamily>;

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

/**
 * Parses the argument for `@uniqueItems` (boolean-marker family).
 *
 * Preserves current `tag-value-parser.ts` semantics exactly:
 * - Empty or whitespace-only → ok marker
 * - Literal `"true"` (after trim) → ok marker
 * - Anything else (including `"false"`) → INVALID_TAG_ARGUMENT
 *
 * Note: `"false"` is invalid because `@uniqueItems` is a presence-only
 * constraint — there is no "uniqueItems: false" JSON Schema keyword that
 * FormSpec emits. The value is always serialized as `true`.
 */
function parseUniqueItemsArgument(rawArgumentText: string): TagArgumentParseResult {
  const trimmed = rawArgumentText.trim();
  if (trimmed === "" || trimmed === "true") {
    return { ok: true, value: { kind: "marker" } };
  }
  return {
    ok: false,
    diagnostic: {
      code: TAG_ARGUMENT_DIAGNOSTIC_CODES.INVALID_TAG_ARGUMENT,
      message: `Expected @uniqueItems to be either empty or "true", got "${trimmed}".`,
    },
  };
}

/**
 * Parses the argument for `@pattern` (string-opaque family).
 *
 * Preserves current opaque-pass-through behavior per §3 of the retirement
 * plan: the raw text is trimmed and returned as-is. `new RegExp(text)` is
 * deliberately NOT called — regex validation is deferred to Phase 2/3 per
 * §6 risk 2. Quoted vs. unquoted strings produce different values (current
 * behavior; normalization is a Phase 2/3 concern).
 */
function parsePatternArgument(rawArgumentText: string): TagArgumentParseResult {
  const trimmed = rawArgumentText.trim();
  if (trimmed === "") {
    return {
      ok: false,
      diagnostic: {
        code: TAG_ARGUMENT_DIAGNOSTIC_CODES.MISSING_TAG_ARGUMENT,
        message: "Expected a pattern string for @pattern.",
      },
    };
  }
  return { ok: true, value: { kind: "string", value: trimmed } };
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
 * @param _lowering - build vs snapshot. Phase 1 implementations do not use
 *                    this; the parameter is accepted for forward-compatibility
 *                    with Phase 2/3 consumer wiring.
 */
export function parseTagArgument(
  tagName: string,
  rawArgumentText: string,
  _lowering: TagArgumentLowering,
): TagArgumentParseResult {
  // Guard against prototype-pollution: names like "toString", "constructor", or
  // "__proto__" exist on every plain object's prototype chain and would bypass
  // the UNKNOWN_TAG path if indexed directly. Object.hasOwn() confines the
  // lookup to own properties only.
  const family: TagFamily | undefined = Object.hasOwn(TAG_ARGUMENT_FAMILIES, tagName)
    ? TAG_ARGUMENT_FAMILIES[tagName as keyof typeof TAG_ARGUMENT_FAMILIES]
    : undefined;

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
      return parseUniqueItemsArgument(rawArgumentText);
    case "string":
      return parsePatternArgument(rawArgumentText);
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
