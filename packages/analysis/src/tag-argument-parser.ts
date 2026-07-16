import type { JsonValue } from "@formspec/core/internals";
import { BUILTIN_CONSTRAINT_DEFINITIONS } from "@formspec/core/internals";
import { parseTagSyntax, type ParsedCommentTag } from "./comment-syntax.js";
import { getJsonLikeBalanceStatus } from "./json-like-balance.js";

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

/**
 * Diagnostic codes emitted by {@link parseTagArgument}.
 *
 * The value-parsing codes (`INVALID_NUMERIC_VALUE`, `INVALID_NON_NEGATIVE_INTEGER`,
 * `INVALID_REGEX_PATTERN`) are the spec-normative codes from 002-tsdoc-grammar §6.
 * They replace the generic `INVALID_TAG_ARGUMENT` for the failure classes the spec
 * names explicitly, so a machine consumer can distinguish a non-finite numeric from
 * a bad length from an uncompilable pattern (D6). `INVALID_TAG_ARGUMENT` remains for
 * failure classes without a dedicated spec code (e.g. `@uniqueItems false`,
 * `@enumOptions 5`).
 */
export const TAG_ARGUMENT_DIAGNOSTIC_CODES = {
  INVALID_TAG_ARGUMENT: "INVALID_TAG_ARGUMENT",
  MISSING_TAG_ARGUMENT: "MISSING_TAG_ARGUMENT",
  UNKNOWN_TAG: "UNKNOWN_TAG",
  /** 002 §3.2 / §6 — numeric tag received NaN, Infinity, overflow, or non-decimal text. */
  INVALID_NUMERIC_VALUE: "INVALID_NUMERIC_VALUE",
  /** 002 §3.2 / §6 — length/count tag received a negative, fractional, or non-integer value. */
  INVALID_NON_NEGATIVE_INTEGER: "INVALID_NON_NEGATIVE_INTEGER",
  /** 002 §3.2 / §6 — `@pattern` value does not compile as an ECMAScript regex. */
  INVALID_REGEX_PATTERN: "INVALID_REGEX_PATTERN",
} as const;

export type TagArgumentDiagnosticCode =
  (typeof TAG_ARGUMENT_DIAGNOSTIC_CODES)[keyof typeof TAG_ARGUMENT_DIAGNOSTIC_CODES];

export interface TagArgumentDiagnostic {
  readonly code: TagArgumentDiagnosticCode;
  /**
   * Human-readable diagnostic message.
   *
   * Both consumers surface `code` directly (via {@link mapTypedParserDiagnosticCode}),
   * so message content is presentational, not load-bearing for classification. The
   * value-parsing codes use the spec-normative message shapes from 002 §6
   * (e.g. `"@minimum" expects a finite number, but received "Infinity".`). The
   * remaining generic-argument messages retain the historical `Expected …` phrasing.
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
 * The trimmed text is the ECMAScript regex source (002 §3.2). The extractor
 * validates that it compiles via `new RegExp(value)`; a value that does not
 * compile is an `INVALID_REGEX_PATTERN` parse error (002 §6) rather than being
 * passed through verbatim — an uncompilable pattern would otherwise reach the
 * generated JSON Schema and crash any validator at schema-compile time.
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
  try {
    // Compile-only validation; the constructed instance is intentionally discarded.
    void new RegExp(trimmed);
  } catch (e) {
    const regexError = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      diagnostic: {
        code: TAG_ARGUMENT_DIAGNOSTIC_CODES.INVALID_REGEX_PATTERN,
        message: `"@pattern" value "${trimmed}" is not a valid ECMAScript regex: ${regexError}.`,
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
 * Matches a non-negative integer per 002 §3.2: `"0" | [1-9][0-9]*`. Rejects
 * negatives, fractions (`2.5`, `1.0`), scientific notation (`1e2`), leading
 * zeros (`01`), and the `Infinity`/`NaN` identifiers.
 */
const NON_NEGATIVE_INTEGER_PATTERN = /^(0|[1-9]\d*)$/;

/**
 * Parses a numeric argument, dispatching on family to the spec's per-tag rule
 * (002 §3.2). This is the single source of truth for numeric/length argument
 * validity — {@link parseConstraintTagValue} routes its IR-producing path
 * through {@link parseTagArgument} so the constraint node and the diagnostic
 * can never disagree (issue #513).
 *
 * - **numeric family** (`@minimum`, `@maximum`, `@exclusiveMinimum`,
 *   `@exclusiveMaximum`, `@multipleOf`): the value must parse to a finite
 *   decimal number. `NaN`, `Infinity`, `-Infinity`, scientific overflow
 *   (`1e400`), and non-decimal forms (`0x10`, `0b10`, `0o10`) are all
 *   `INVALID_NUMERIC_VALUE`. Negatives and fractions are accepted.
 * - **length family** (`@minLength`, `@maxLength`, `@minItems`, `@maxItems`):
 *   the value must be a non-negative integer. Negatives, fractions, and every
 *   numeric-family reject are `INVALID_NON_NEGATIVE_INTEGER`.
 *
 * @param tagName - normalized tag name (no "@"), typed as a known registry key
 * @param rawArgumentText - argument text, already stripped of path-target prefix
 * @param family - "numeric" or "length"; selects the spec rule and error code
 * @param _lowering - build vs snapshot; reserved for consumer-specific wiring
 */
function parseNumericArgument(
  tagName: keyof typeof TAG_ARGUMENT_FAMILIES,
  rawArgumentText: string,
  family: "numeric" | "length",
  _lowering: TagArgumentLowering
): TagArgumentParseResult {
  const text = rawArgumentText.trim();

  if (text.length === 0) {
    return {
      ok: false,
      diagnostic: {
        code: TAG_ARGUMENT_DIAGNOSTIC_CODES.MISSING_TAG_ARGUMENT,
        message:
          family === "length"
            ? `Expected a non-negative integer for @${tagName}.`
            : `Expected a numeric literal for @${tagName}.`,
      },
    };
  }

  if (family === "length") {
    if (!NON_NEGATIVE_INTEGER_PATTERN.test(text)) {
      return {
        ok: false,
        diagnostic: {
          code: TAG_ARGUMENT_DIAGNOSTIC_CODES.INVALID_NON_NEGATIVE_INTEGER,
          message: `"@${tagName}" expects a non-negative integer, but received "${text}".`,
        },
      };
    }
    const value = Number(text);
    // A digit string long enough to exceed Number.MAX_VALUE matches the integer
    // grammar but converts to Infinity. Accepting it would reintroduce exactly the
    // non-finite keyword this issue kills, so reject non-finite results here too.
    if (!isFinite(value)) {
      return {
        ok: false,
        diagnostic: {
          code: TAG_ARGUMENT_DIAGNOSTIC_CODES.INVALID_NON_NEGATIVE_INTEGER,
          message: `"@${tagName}" expects a non-negative integer, but received "${text}".`,
        },
      };
    }
    return { ok: true, value: { kind: "number", value } };
  }

  // numeric family: finite decimal only. Reject non-decimal forms (hex/binary/
  // octal), the `Infinity`/`-Infinity`/`NaN` identifiers, and non-numeric text —
  // all of these fail the decimal grammar.
  if (!DECIMAL_PATTERN.test(text)) {
    return {
      ok: false,
      diagnostic: {
        code: TAG_ARGUMENT_DIAGNOSTIC_CODES.INVALID_NUMERIC_VALUE,
        message: `"@${tagName}" expects a finite number, but received "${text}".`,
      },
    };
  }

  const value = Number(text);

  // A decimal literal that overflows to Infinity (e.g. `1e400`) is not finite
  // and is therefore also an invalid numeric value.
  if (!isFinite(value)) {
    return {
      ok: false,
      diagnostic: {
        code: TAG_ARGUMENT_DIAGNOSTIC_CODES.INVALID_NUMERIC_VALUE,
        message: `"@${tagName}" expects a finite number, but received "${text}".`,
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
 * JSON-shaped payloads with unbalanced brackets/braces are argument errors
 * instead of raw-string fallbacks. Balanced-but-invalid JSON still falls back
 * to a raw string to preserve existing `@const` semantics.
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

  if (getJsonLikeBalanceStatus(rawArgumentText) === "unbalanced") {
    return {
      ok: false,
      diagnostic: {
        code: TAG_ARGUMENT_DIAGNOSTIC_CODES.INVALID_TAG_ARGUMENT,
        message: "Expected a balanced JSON value for @const.",
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
 * Parses a single constraint-tag argument literal for the Role C typed-parser
 * validation step.
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

// =============================================================================
// Shared code-mapping helper used by both consumers
// =============================================================================

/**
 * The subset of diagnostic codes that both consumers (build and snapshot) may
 * emit as a result of a typed-parser rejection at Role C.
 *
 * `UNKNOWN_TAG` is never included: it is structurally unreachable in any
 * consumer that guards the {@link parseTagArgument} call with an
 * `isBuiltinConstraintName` or `getTagDefinition` check.
 */
export type MappedTypedParserCode =
  | "MISSING_TAG_ARGUMENT"
  | "INVALID_TAG_ARGUMENT"
  | "INVALID_NUMERIC_VALUE"
  | "INVALID_NON_NEGATIVE_INTEGER"
  | "INVALID_REGEX_PATTERN";

/**
 * Maps a {@link TagArgumentDiagnosticCode} from {@link parseTagArgument} to the
 * canonical consumer-level code emitted when the typed parser rejects an
 * argument at Role C.
 *
 * Both the build consumer (`tsdoc-parser.ts`) and the snapshot consumer
 * (`file-snapshots.ts`) previously contained identical exhaustive switches for
 * this mapping. This helper centralises the logic.
 *
 * @throws if `code` is `UNKNOWN_TAG` (structurally unreachable after the
 *   `isBuiltinConstraintName` / `getTagDefinition` guard) or an unrecognised
 *   value (exhaustiveness guard for future additions).
 */
export function mapTypedParserDiagnosticCode(
  code: TagArgumentDiagnosticCode,
  tagName: string
): MappedTypedParserCode {
  switch (code) {
    case "MISSING_TAG_ARGUMENT":
      return "MISSING_TAG_ARGUMENT";
    case "INVALID_TAG_ARGUMENT":
      return "INVALID_TAG_ARGUMENT";
    // Value-parsing codes (002 §6) pass through unchanged so machine consumers
    // see the specific failure class, not a generic INVALID_TAG_ARGUMENT.
    case "INVALID_NUMERIC_VALUE":
      return "INVALID_NUMERIC_VALUE";
    case "INVALID_NON_NEGATIVE_INTEGER":
      return "INVALID_NON_NEGATIVE_INTEGER";
    case "INVALID_REGEX_PATTERN":
      return "INVALID_REGEX_PATTERN";
    case "UNKNOWN_TAG":
      // Structurally unreachable: callers must guard with isBuiltinConstraintName /
      // getTagDefinition before invoking parseTagArgument. If this fires, it's a bug.
      throw new Error(
        `Unexpected UNKNOWN_TAG from parseTagArgument("${tagName}") — tag was resolved via getTagDefinition.`
      );
    default: {
      const _exhaustive: never = code;
      throw new Error(`Unhandled diagnostic code: ${String(_exhaustive)}`);
    }
  }
}

// =============================================================================
// Shared argument-text extraction helper (Phase 4B)
// =============================================================================

/**
 * Derives the effective argument text that should be passed to
 * `parseTagArgument` for the Role C typed-parser validation step.
 *
 * Both the build consumer (`tsdoc-parser.ts`) and the snapshot consumer
 * (`file-snapshots.ts`) need to extract the same argument text from a tag
 * payload before Role C validation. The two consumers previously diverged:
 *
 * - Build consumer re-derives via `parseTagSyntax(tagName, rawText).argumentText`
 *   so that path-target prefixes are stripped. `rawText` is the full payload
 *   (may include `:field` target prefix) already chosen by
 *   `choosePreferredPayloadText` upstream — including `TAGS_REQUIRING_RAW_TEXT`
 *   compiler-API fallback selection. By the time this helper is called, the
 *   preferred payload has already been selected; this helper only strips the
 *   path-target prefix and canonicalizes the argument text.
 * - Snapshot consumer passed `tag.argumentText` directly (which is already
 *   target-stripped by `parseCommentBlock`).
 *
 * This helper encodes the two cases that both consumers must handle:
 * 1. **Standard path** (`parsedTag` non-null): re-parse `rawText` through
 *    `parseTagSyntax` to strip any path-target prefix and canonicalize
 *    the argument text. For the snapshot consumer, `rawText` equals
 *    `tag.argumentText` (already stripped), so `parseTagSyntax` is a no-op.
 * 2. **Orphaned fallback** (`parsedTag` null): the unified comment parser
 *    failed to produce a tag object (e.g. malformed comment), but a raw-text
 *    fallback from `ts.getJSDocTags()` was recovered. Return `rawText`
 *    directly — there is no parsed tag to re-derive from.
 *
 * Both consumers call this helper with their respective `rawText` and
 * `parsedTag`, ensuring that the text handed to `parseTagArgument` is derived
 * identically regardless of consumer.
 *
 * @param tagName   - normalized tag name (no leading `@`)
 * @param rawText   - the post-`choosePreferredPayloadText` payload string,
 *                    possibly including a path-target prefix (`:field`).
 *                    `TAGS_REQUIRING_RAW_TEXT` selection is handled upstream
 *                    by `choosePreferredPayloadText` before this helper is
 *                    called.
 * @param parsedTag - the parsed comment tag from `parseCommentBlock`, or
 *                    `null` for orphaned compiler-API fallback entries.
 *
 * @internal
 */
export function extractEffectiveArgumentText(
  tagName: string,
  rawText: string,
  parsedTag: ParsedCommentTag | null
): string {
  if (parsedTag !== null) {
    return parseTagSyntax(tagName, rawText).argumentText;
  }
  // Orphaned fallback: no parsed tag object — use rawText as-is.
  return rawText;
}
