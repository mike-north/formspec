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
 * Parses the argument for `@pattern` (string family).
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

/**
 * Matches decimal numeric literals only: optional sign, decimal digits, optional
 * fractional part, optional scientific exponent. Does NOT match hex (`0x`),
 * binary (`0b`), octal (`0o`), or any other non-decimal form.
 *
 * Used as a pre-check in {@link parseNumericArgument} to prevent `Number()`
 * from silently accepting non-TSDoc-idiomatic forms like `0x10` → `16`.
 */
const DECIMAL_PATTERN = /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Parses a numeric argument for both the "numeric" and "length" families.
 *
 * Phase 1 semantics (per §3 of the retirement plan):
 * - Empty/whitespace-only text → MISSING_TAG_ARGUMENT
 * - `Infinity`, `-Infinity`, `NaN` identifiers → accepted as-is (pins current
 *   snapshot-consumer behavior; build-consumer stringifies — divergence is
 *   handled by `lowering` in Phase 2/3)
 * - Non-decimal numeric forms (hex `0x`, binary `0b`, octal `0o`) → INVALID
 * - Scientific overflow (e.g. `1e400` → Infinity) → INVALID (only the explicit
 *   `Infinity` identifier, not overflow, is accepted)
 * - `Number(text) === NaN` (and text was not the literal "NaN") → INVALID_TAG_ARGUMENT
 * - Otherwise → `{ kind: "number", value }` with the parsed number
 *
 * Integer erasure is preserved: `@minLength 1.5` returns `ok: true` with
 * `value: 1.5`. Rejecting non-integer values is a Role D concern, not Role C.
 *
 * The `family` and `_lowering` parameters are unused in Phase 1 but are
 * accepted here for forward-compatibility with Phase 2/3 divergence wiring.
 *
 * @param tagName - normalized tag name (no "@"), typed as a known registry key
 * @param rawArgumentText - argument text, already stripped of path-target prefix
 * @param _family - "numeric" or "length"; reserved for Phase 2/3 message divergence
 *   (rename to `family` when Phase 2/3 diverges error messages between families)
 * @param _lowering - build vs snapshot; reserved for Phase 2/3 consumer wiring
 */
// TODO Phase 2/5: consolidate numeric parsing with tag-value-parser.ts
function parseNumericArgument(
  tagName: keyof typeof TAG_ARGUMENT_FAMILIES,
  rawArgumentText: string,
  _family: "numeric" | "length",
  _lowering: TagArgumentLowering
): TagArgumentParseResult {
  const text = rawArgumentText.trim();

  if (text.length === 0) {
    return {
      ok: false,
      diagnostic: {
        code: TAG_ARGUMENT_DIAGNOSTIC_CODES.MISSING_TAG_ARGUMENT,
        message: `Expected a numeric literal for @${tagName}.`,
      },
    };
  }

  // Pin current consumer behavior: Infinity, -Infinity, and NaN are accepted
  // as valid numeric arguments. The synthetic snapshot path passes these
  // identifiers through as-is. See §3 "Tie-break Infinity/NaN" and §9.3 #16.
  if (text === "Infinity") {
    return { ok: true, value: { kind: "number", value: Infinity } };
  }
  if (text === "-Infinity") {
    return { ok: true, value: { kind: "number", value: -Infinity } };
  }
  if (text === "NaN") {
    return { ok: true, value: { kind: "number", value: NaN } };
  }

  // Reject non-decimal numeric literals (hex, binary, octal) and any other
  // non-TSDoc-idiomatic form that `Number()` would silently accept.
  // The explicit `Infinity`/`-Infinity`/`NaN` identifiers are handled above.
  if (!DECIMAL_PATTERN.test(text)) {
    return {
      ok: false,
      diagnostic: {
        code: TAG_ARGUMENT_DIAGNOSTIC_CODES.INVALID_TAG_ARGUMENT,
        message: `Expected a numeric literal for @${tagName}, got "${text}".`,
      },
    };
  }

  const value = Number(text);

  // A decimal literal that overflows to Infinity (e.g. `1e400`) is not a valid
  // TSDoc constraint argument. Only the explicit `Infinity` identifier (handled
  // above) is accepted.
  if (!isFinite(value)) {
    return {
      ok: false,
      diagnostic: {
        code: TAG_ARGUMENT_DIAGNOSTIC_CODES.INVALID_TAG_ARGUMENT,
        message: `Expected a finite numeric literal for @${tagName}, got ${text} (overflows to Infinity).`,
      },
    };
  }

  return { ok: true, value: { kind: "number", value } };
}

/**
 * Returns true when `value` is a valid JSON domain value.
 *
 * `JSON.parse` in standard runtimes only ever produces values in the
 * JSON domain, but the type system cannot prove that — it returns `any`.
 * This guard bridges that gap so that we can assign the result to
 * `JsonValue` without an unsound cast.
 *
 * The object branch is intentionally strict:
 * - rejects arrays (handled by the array branch)
 * - rejects class instances and wrapped primitives (`Object(10n)`)
 * - rejects objects with symbol-keyed own properties
 * - only accepts `Object.prototype` objects with `JsonValue` own values
 */
function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (t === "object") {
    // Reject class instances, wrapped primitives, etc.
    if (Object.getPrototypeOf(value) !== Object.prototype) return false;
    // Reject symbol-keyed own properties (not expressible in JSON).
    if (Object.getOwnPropertySymbols(value).length > 0) return false;
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }
  return false;
}

/**
 * Parses the argument text for `@enumOptions` (json-array family).
 *
 * Rules (preserving tag-value-parser.ts:~178-204 semantics):
 * - Empty or whitespace-only text → MISSING_TAG_ARGUMENT
 * - Invalid JSON → INVALID_TAG_ARGUMENT
 * - Valid JSON but not an array → INVALID_TAG_ARGUMENT (reports typeof)
 * - Valid JSON array with any non-JsonValue member → INVALID_TAG_ARGUMENT
 * - Valid JSON array of JsonValue members → ok with { kind: "json-array", value: parsed }
 *
 * @remarks
 * Member-type acceptance and filtering beyond the JsonValue domain is Role D
 * (tag-value-parser.ts:~183-195). Role D accepts `string`, `number`, and
 * `{id: string|number}` members and silently drops anything else. This parser
 * (Role C) validates that every element is a legal JSON value; Role D then
 * further narrows the set to semantically valid enum-option members.
 */
function parseEnumOptionsArgument(rawArgumentText: string): TagArgumentParseResult {
  const trimmed = rawArgumentText.trim();

  if (trimmed === "") {
    return {
      ok: false,
      diagnostic: {
        code: TAG_ARGUMENT_DIAGNOSTIC_CODES.MISSING_TAG_ARGUMENT,
        message: "Expected a JSON array for @enumOptions.",
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    return {
      ok: false,
      diagnostic: {
        code: TAG_ARGUMENT_DIAGNOSTIC_CODES.INVALID_TAG_ARGUMENT,
        message: "Expected @enumOptions to be a JSON array, got invalid JSON.",
      },
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      diagnostic: {
        code: TAG_ARGUMENT_DIAGNOSTIC_CODES.INVALID_TAG_ARGUMENT,
        message: `Expected @enumOptions to be a JSON array, got ${typeof parsed}.`,
      },
    };
  }

  // Re-bind to unknown[] so the isJsonValue predicate narrows soundly to
  // JsonValue[] instead of relying on the any-typed Array.isArray narrowing
  // (Array.isArray(x: unknown) narrows to any[], not unknown[]).
  const arr: unknown[] = parsed;

  if (!arr.every(isJsonValue)) {
    return {
      ok: false,
      diagnostic: {
        code: TAG_ARGUMENT_DIAGNOSTIC_CODES.INVALID_TAG_ARGUMENT,
        message: "Expected @enumOptions elements to be JSON values, got invalid member type.",
      },
    };
  }

  return {
    ok: true,
    value: { kind: "json-array", value: arr },
  };
}

/**
 * Parses the argument text for `@const` (json-value-with-fallback family).
 *
 * Rules (preserving tag-value-parser.ts:~151-176 semantics):
 * - Empty or whitespace-only text → MISSING_TAG_ARGUMENT
 * - Valid JSON → ok with { kind: "json-value", value: parsed }
 * - Invalid JSON → ok with { kind: "raw-string-fallback", value: trimmedText }
 *   The raw-string fallback is a SUCCESSFUL outcome, not a diagnostic. The
 *   downstream IR compatibility check decides if the raw string matches the
 *   target type (semantic-targets.ts:~1255-1298).
 *
 * Note: parseTagSyntax truncates multi-line JSON at the first newline before
 * this parser runs (upstream issue #327 / PR #314 pin), so `@const [\n1,\n2\n]`
 * arrives as `"["` and hits the fallback path intentionally.
 */
function parseConstArgument(rawArgumentText: string): TagArgumentParseResult {
  const trimmed = rawArgumentText.trim();

  if (trimmed === "") {
    return {
      ok: false,
      diagnostic: {
        code: TAG_ARGUMENT_DIAGNOSTIC_CODES.MISSING_TAG_ARGUMENT,
        message: "Expected a JSON value for @const.",
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    return {
      ok: true,
      value: { kind: "raw-string-fallback", value: trimmed },
    };
  }

  if (!isJsonValue(parsed)) {
    // Defensive: JSON.parse in standard runtimes only produces JsonValue-domain
    // results, but the type system can't prove it. Fall back to raw-string to
    // preserve current semantics.
    return {
      ok: true,
      value: { kind: "raw-string-fallback", value: trimmed },
    };
  }

  return {
    ok: true,
    value: { kind: "json-value", value: parsed },
  };
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
  _lowering: TagArgumentLowering
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

  // Exhaustive switch — TypeScript's `never` check in the default arm ensures
  // any new TagFamily variant forces a compile error until all cases are wired.
  switch (family) {
    case "numeric":
      // Cast is safe: Object.hasOwn guard above confirmed tagName ∈ TAG_ARGUMENT_FAMILIES.
      return parseNumericArgument(
        tagName as keyof typeof TAG_ARGUMENT_FAMILIES,
        rawArgumentText,
        "numeric",
        _lowering
      );
    case "length":
      // Same parse rule as numeric; Phase 2/3 may diverge them if needed.
      // Cast is safe: same Object.hasOwn guard as the "numeric" arm.
      return parseNumericArgument(
        tagName as keyof typeof TAG_ARGUMENT_FAMILIES,
        rawArgumentText,
        "length",
        _lowering
      );
    case "boolean-marker":
      return parseUniqueItemsArgument(rawArgumentText);
    case "string":
      return parsePatternArgument(rawArgumentText);
    case "json-array":
      return parseEnumOptionsArgument(rawArgumentText);
    case "json-value-with-fallback":
      return parseConstArgument(rawArgumentText);
    default: {
      // Exhaustiveness guard: if a new TagFamily variant is added without
      // updating this switch, the compiler will flag the assignment below.
      const _exhaustiveCheck: never = family;
      throw new Error(`Unexpected tag family: ${String(_exhaustiveCheck)}`);
    }
  }
}
