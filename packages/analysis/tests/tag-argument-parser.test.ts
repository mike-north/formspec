import { describe, expect, it } from "vitest";
import { BUILTIN_CONSTRAINT_DEFINITIONS } from "@formspec/core/internals";
import {
  type TagArgumentLowering,
  type TagFamily,
  extractEffectiveArgumentText,
  parseTagArgument,
  TAG_ARGUMENT_FAMILIES,
  type TagArgumentValue,
} from "../src/tag-argument-parser.js";
import { parseCommentBlock } from "../src/comment-syntax.js";

// ---------------------------------------------------------------------------
// Test helpers (local — keep in this file, not promoted to a shared helper)
// ---------------------------------------------------------------------------

/**
 * Asserts that parseTagArgument returns `{ ok: true, kind: "number", value }`.
 * Uses `Number.isNaN` comparison for NaN values since `NaN !== NaN`.
 */
function expectNumericValue(tag: string, text: string, expectedValue: number): void {
  const result = parseTagArgument(tag, text, "build");
  expect(result.ok, `Expected ok:true for @${tag} "${text}"`).toBe(true);
  if (result.ok) {
    expect(result.value.kind).toBe("number");
    if (result.value.kind === "number") {
      if (Number.isNaN(expectedValue)) {
        expect(Number.isNaN(result.value.value), "Expected NaN value").toBe(true);
      } else {
        expect(result.value.value).toBe(expectedValue);
      }
    }
  }
}

/**
 * Asserts that parseTagArgument returns `{ ok: false, code: "MISSING_TAG_ARGUMENT" }`.
 */
function expectMissingArgument(tag: string, text: string): void {
  const result = parseTagArgument(tag, text, "build");
  expect(result.ok, `Expected ok:false for @${tag} "${text}"`).toBe(false);
  if (!result.ok) {
    expect(result.diagnostic.code).toBe("MISSING_TAG_ARGUMENT");
    expect(result.diagnostic.message).toMatch(/^Expected /);
    expect(result.diagnostic.message).toContain(`@${tag}`);
  }
}

/**
 * Asserts that a numeric-family argument is rejected with the spec-normative
 * `INVALID_NUMERIC_VALUE` code (002 §3.2 / §6). The message names the tag and
 * echoes the offending value.
 */
function expectInvalidNumericValue(tag: string, text: string): void {
  const result = parseTagArgument(tag, text, "build");
  expect(result.ok, `Expected ok:false for @${tag} "${text}"`).toBe(false);
  if (!result.ok) {
    expect(result.diagnostic.code).toBe("INVALID_NUMERIC_VALUE");
    expect(result.diagnostic.message).toContain(`@${tag}`);
    expect(result.diagnostic.message).toContain(`"${text.trim()}"`);
  }
}

/**
 * Asserts that a length-family argument is rejected with the spec-normative
 * `INVALID_NON_NEGATIVE_INTEGER` code (002 §3.2 / §6). The message names the tag
 * and echoes the offending value.
 */
function expectInvalidNonNegativeInteger(tag: string, text: string): void {
  const result = parseTagArgument(tag, text, "build");
  expect(result.ok, `Expected ok:false for @${tag} "${text}"`).toBe(false);
  if (!result.ok) {
    expect(result.diagnostic.code).toBe("INVALID_NON_NEGATIVE_INTEGER");
    expect(result.diagnostic.message).toContain(`@${tag}`);
    expect(result.diagnostic.message).toContain(`"${text.trim()}"`);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseTagArgument", () => {
  // Phase 1 lifecycle note: each family's "lowering flag produces identical output" test
  // asserts that 'build' and 'snapshot' lowering produce the same result. This is correct
  // in Phase 1 only — Phase 2/3 will diverge build vs snapshot lowering at wiring time.
  // Delete or invert these tests when wiring Phase 2/3 lowering for a given family.

  describe("registry", () => {
    it("maps exactly the keys of BUILTIN_CONSTRAINT_DEFINITIONS to a family", () => {
      // Derive expected set from the single source of truth so that adding or
      // removing a tag in core automatically fails this test instead of silently
      // drifting out of sync with a hard-coded list.
      const expected = new Set(Object.keys(BUILTIN_CONSTRAINT_DEFINITIONS));
      expect(new Set(Object.keys(TAG_ARGUMENT_FAMILIES))).toEqual(expected);
    });

    it("returns UNKNOWN_TAG for tag names not in the registry", () => {
      const result = parseTagArgument("notATag", "42", "build");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("UNKNOWN_TAG");
        expect(result.diagnostic.message).toContain("notATag");
      }
    });

    it("each family rejects a bad argument with its spec-normative diagnostic code", () => {
      // Consumers surface `code` directly (via mapTypedParserDiagnosticCode), so the
      // per-family diagnostic code — not a message prefix — is the contract. Codes
      // trace to 002 §6: numeric → INVALID_NUMERIC_VALUE, length →
      // INVALID_NON_NEGATIVE_INTEGER, pattern → INVALID_REGEX_PATTERN; families with
      // no dedicated spec code keep the generic INVALID_TAG_ARGUMENT / MISSING codes.
      const cases = [
        { tag: "minimum", raw: "hello", code: "INVALID_NUMERIC_VALUE" },
        { tag: "minLength", raw: "hello", code: "INVALID_NON_NEGATIVE_INTEGER" },
        { tag: "pattern", raw: "(", code: "INVALID_REGEX_PATTERN" },
        { tag: "uniqueItems", raw: "false", code: "INVALID_TAG_ARGUMENT" },
        { tag: "enumOptions", raw: "5", code: "INVALID_TAG_ARGUMENT" },
        { tag: "const", raw: "", code: "MISSING_TAG_ARGUMENT" },
      ] satisfies { tag: keyof typeof TAG_ARGUMENT_FAMILIES; raw: string; code: string }[];

      for (const { tag, raw, code } of cases) {
        const result = parseTagArgument(tag, raw, "build");
        expect(result.ok, `expected failure for @${tag} "${raw}"`).toBe(false);
        if (!result.ok) {
          expect(result.diagnostic.code, `code for @${tag} "${raw}"`).toBe(code);
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Slice A: numeric family
  // ---------------------------------------------------------------------------
  describe("numeric family", () => {
    // Full battery on @minimum; abbreviated per-tag tests for the others.

    describe("@minimum — full battery", () => {
      it("parses a positive integer", () => {
        expectNumericValue("minimum", "10", 10);
      });

      it("parses a positive float (integer erasure: no rejection)", () => {
        // Per §1.6 of the retirement plan: integer erasure means Role C must NOT
        // reject non-integer arguments. Rejecting is a Role D concern.
        expectNumericValue("minimum", "10.5", 10.5);
      });

      it("parses a negative integer", () => {
        expectNumericValue("minimum", "-5", -5);
      });

      it("parses zero", () => {
        expectNumericValue("minimum", "0", 0);
      });

      it("rejects Infinity (002 §3.2 — non-finite is INVALID_NUMERIC_VALUE)", () => {
        // Regression for #513: `@minimum Infinity` used to pass through, producing
        // `minimum: Infinity` → JSON.stringify → `null` → schema invalid against the
        // meta-schema, with no diagnostic.
        expectInvalidNumericValue("minimum", "Infinity");
      });

      it("rejects -Infinity (002 §3.2)", () => {
        expectInvalidNumericValue("minimum", "-Infinity");
      });

      it("rejects NaN (002 §3.2 — non-finite is INVALID_NUMERIC_VALUE)", () => {
        expectInvalidNumericValue("minimum", "NaN");
      });

      it("accepts -0 (pins current behavior — Object.is distinguishes -0 from +0)", () => {
        const result = parseTagArgument("minimum", "-0", "build");
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.kind).toBe("number");
          if (result.value.kind === "number") {
            // Object.is distinguishes -0 from +0; Number("-0") === -0.
            expect(Object.is(result.value.value, -0)).toBe(true);
          }
        }
      });

      it("accepts .5 (leading-decimal shorthand for 0.5)", () => {
        expectNumericValue("minimum", ".5", 0.5);
      });

      it("accepts 5. (trailing-decimal shorthand for 5)", () => {
        expectNumericValue("minimum", "5.", 5);
      });

      it("accepts valid small scientific notation (1e-10)", () => {
        expectNumericValue("minimum", "1e-10", 1e-10);
      });

      it("returns MISSING_TAG_ARGUMENT for empty string", () => {
        expectMissingArgument("minimum", "");
      });

      it("returns MISSING_TAG_ARGUMENT for whitespace-only string", () => {
        expectMissingArgument("minimum", "   ");
      });

      it("rejects alphabetic text", () => {
        expectInvalidNumericValue("minimum", "hello");
      });

      it("rejects numeric text with invalid suffix", () => {
        expectInvalidNumericValue("minimum", "10x");
      });

      it("rejects hex literal (0x10 must not silently become 16)", () => {
        // Regression for #513: Number("0x10") === 16, but @minimum 0x10 is not
        // TSDoc-idiomatic. The IR path used to accept it (hover/schema said 16) while
        // the diagnostic path rejected it — the divergence this consolidation removes.
        expectInvalidNumericValue("minimum", "0x10");
      });

      it("rejects binary literal (0b10 must not silently become 2)", () => {
        expectInvalidNumericValue("minimum", "0b10");
      });

      it("rejects octal literal (0o10 must not silently become 8)", () => {
        expectInvalidNumericValue("minimum", "0o10");
      });

      it("rejects lowercase 'infinity' (not a valid decimal literal)", () => {
        expectInvalidNumericValue("minimum", "infinity");
      });

      it("rejects lowercase 'nan' (not a valid decimal literal)", () => {
        expectInvalidNumericValue("minimum", "nan");
      });

      it("rejects scientific overflow (1e400 overflows to Infinity)", () => {
        // A decimal literal that overflows to Infinity is not finite → INVALID_NUMERIC_VALUE.
        expectInvalidNumericValue("minimum", "1e400");
      });

      it("includes tag name in the rejection message", () => {
        const result = parseTagArgument("minimum", "hello", "build");
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.diagnostic.message).toContain("@minimum");
        }
      });

      it("includes the bad text in the rejection message", () => {
        const result = parseTagArgument("minimum", "hello", "build");
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.diagnostic.message).toContain('"hello"');
        }
      });
    });

    describe("@maximum — one positive + one negative (shared helper, tag name in message)", () => {
      it("parses a valid number", () => {
        expectNumericValue("maximum", "100", 100);
      });

      it("returns INVALID_TAG_ARGUMENT with correct tag name in message", () => {
        const result = parseTagArgument("maximum", "bad", "build");
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.diagnostic.code).toBe("INVALID_NUMERIC_VALUE");
          expect(result.diagnostic.message).toContain("@maximum");
        }
      });
    });

    describe("@exclusiveMinimum", () => {
      it("parses a valid number", () => {
        expectNumericValue("exclusiveMinimum", "0.5", 0.5);
      });

      it("returns INVALID_TAG_ARGUMENT with correct tag name in message", () => {
        const result = parseTagArgument("exclusiveMinimum", "bad", "build");
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.diagnostic.code).toBe("INVALID_NUMERIC_VALUE");
          expect(result.diagnostic.message).toContain("@exclusiveMinimum");
        }
      });
    });

    describe("@exclusiveMaximum", () => {
      it("parses a valid number", () => {
        expectNumericValue("exclusiveMaximum", "1000", 1000);
      });

      it("returns INVALID_TAG_ARGUMENT with correct tag name in message", () => {
        const result = parseTagArgument("exclusiveMaximum", "bad", "build");
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.diagnostic.code).toBe("INVALID_NUMERIC_VALUE");
          expect(result.diagnostic.message).toContain("@exclusiveMaximum");
        }
      });
    });

    describe("@multipleOf", () => {
      it("parses a valid number", () => {
        expectNumericValue("multipleOf", "5", 5);
      });

      it("returns INVALID_TAG_ARGUMENT with correct tag name in message", () => {
        const result = parseTagArgument("multipleOf", "bad", "build");
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.diagnostic.code).toBe("INVALID_NUMERIC_VALUE");
          expect(result.diagnostic.message).toContain("@multipleOf");
        }
      });
    });

    describe("lowering flag is a no-op in Phase 1", () => {
      it("produces identical output for 'build' and 'snapshot' lowering", () => {
        const buildResult = parseTagArgument("minimum", "42", "build");
        const snapshotResult = parseTagArgument("minimum", "42", "snapshot");
        expect(buildResult).toEqual(snapshotResult);
      });

      it("produces identical error for 'build' and 'snapshot' lowering on invalid input", () => {
        const buildResult = parseTagArgument("minimum", "bad", "build");
        const snapshotResult = parseTagArgument("minimum", "bad", "snapshot");
        expect(buildResult).toEqual(snapshotResult);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Slice A: length family
  // ---------------------------------------------------------------------------
  describe("length family", () => {
    // Full battery on @minLength; abbreviated per-tag tests for the others.

    describe("@minLength — full battery", () => {
      it("parses a positive integer", () => {
        expectNumericValue("minLength", "1", 1);
      });

      it("parses zero", () => {
        expectNumericValue("minLength", "0", 0);
      });

      it("rejects a fractional value (002 §3.2 — length is a non-negative integer)", () => {
        // Regression for #513: `@minLength 1.5` / `@maxItems 2.5` used to pass
        // through verbatim, emitting a fractional length keyword. The length grammar
        // is `"0" | [1-9][0-9]*`, so a fraction is INVALID_NON_NEGATIVE_INTEGER.
        expectInvalidNonNegativeInteger("minLength", "1.5");
      });

      it("rejects a negative value (002 §3.2)", () => {
        expectInvalidNonNegativeInteger("minLength", "-5");
      });

      it("rejects an integer-valued float form like 1.0 (not a bare integer)", () => {
        expectInvalidNonNegativeInteger("minLength", "1.0");
      });

      it("rejects a leading-zero form like 01 (grammar is 0 | [1-9][0-9]*)", () => {
        expectInvalidNonNegativeInteger("minLength", "01");
      });

      it("rejects Infinity", () => {
        expectInvalidNonNegativeInteger("minLength", "Infinity");
      });

      it("rejects -Infinity", () => {
        expectInvalidNonNegativeInteger("minLength", "-Infinity");
      });

      it("rejects NaN", () => {
        expectInvalidNonNegativeInteger("minLength", "NaN");
      });

      it("returns MISSING_TAG_ARGUMENT for empty string", () => {
        expectMissingArgument("minLength", "");
      });

      it("returns MISSING_TAG_ARGUMENT for whitespace-only string", () => {
        expectMissingArgument("minLength", "   ");
      });

      it("rejects alphabetic text", () => {
        expectInvalidNonNegativeInteger("minLength", "hello");
      });

      it("rejects numeric text with invalid suffix", () => {
        expectInvalidNonNegativeInteger("minLength", "10x");
      });

      it("includes tag name in the rejection message", () => {
        const result = parseTagArgument("minLength", "bad", "build");
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.diagnostic.message).toContain("@minLength");
        }
      });
    });

    describe("@maxLength", () => {
      it("parses a valid number", () => {
        expectNumericValue("maxLength", "255", 255);
      });

      it("returns INVALID_TAG_ARGUMENT with correct tag name in message", () => {
        const result = parseTagArgument("maxLength", "bad", "build");
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.diagnostic.code).toBe("INVALID_NON_NEGATIVE_INTEGER");
          expect(result.diagnostic.message).toContain("@maxLength");
        }
      });
    });

    describe("@minItems", () => {
      it("parses a valid number", () => {
        expectNumericValue("minItems", "2", 2);
      });

      it("returns INVALID_TAG_ARGUMENT with correct tag name in message", () => {
        const result = parseTagArgument("minItems", "bad", "build");
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.diagnostic.code).toBe("INVALID_NON_NEGATIVE_INTEGER");
          expect(result.diagnostic.message).toContain("@minItems");
        }
      });
    });

    describe("@maxItems", () => {
      it("parses a valid number", () => {
        expectNumericValue("maxItems", "10", 10);
      });

      it("returns INVALID_TAG_ARGUMENT with correct tag name in message", () => {
        const result = parseTagArgument("maxItems", "bad", "build");
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.diagnostic.code).toBe("INVALID_NON_NEGATIVE_INTEGER");
          expect(result.diagnostic.message).toContain("@maxItems");
        }
      });
    });

    describe("lowering flag is a no-op in Phase 1", () => {
      it("produces identical output for 'build' and 'snapshot' lowering", () => {
        const buildResult = parseTagArgument("minLength", "5", "build");
        const snapshotResult = parseTagArgument("minLength", "5", "snapshot");
        expect(buildResult).toEqual(snapshotResult);
      });
    });
  });

  // Slice B owns these.
  describe("boolean-marker (@uniqueItems)", () => {
    // ---------------------------------------------------------------------------
    // Local helpers
    // ---------------------------------------------------------------------------

    /** Assert that the result is an ok marker. */
    function expectMarker(rawText: string): void {
      const result = parseTagArgument("uniqueItems", rawText, "build");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ kind: "marker" });
      }
    }

    /** Assert that the result is INVALID_TAG_ARGUMENT containing the offending value. */
    function expectInvalidMarker(rawText: string): void {
      const result = parseTagArgument("uniqueItems", rawText, "build");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("INVALID_TAG_ARGUMENT");
        expect(result.diagnostic.message).toMatch(/^Expected/);
        expect(result.diagnostic.message).toContain(rawText.trim());
      }
    }

    // ---------------------------------------------------------------------------
    // Valid inputs → marker
    // ---------------------------------------------------------------------------

    it("empty string → marker", () => {
      expectMarker("");
    });

    it("whitespace-only → marker", () => {
      expectMarker("   ");
    });

    it('"true" → marker', () => {
      expectMarker("true");
    });

    it('"true" with surrounding whitespace → marker (trimmed)', () => {
      expectMarker("  true  ");
    });

    // ---------------------------------------------------------------------------
    // Invalid inputs → INVALID_TAG_ARGUMENT
    // ---------------------------------------------------------------------------

    it('"false" → INVALID (not a valid presence-marker value)', () => {
      expectInvalidMarker("false");
    });

    it('"yes" → INVALID', () => {
      expectInvalidMarker("yes");
    });

    it('"1" → INVALID', () => {
      expectInvalidMarker("1");
    });

    it('"TRUE" → INVALID (case-sensitive — pin current behavior)', () => {
      expectInvalidMarker("TRUE");
    });

    it('"True" → INVALID (case-sensitive — pin current behavior)', () => {
      expectInvalidMarker("True");
    });

    it('"maybe" → INVALID', () => {
      expectInvalidMarker("maybe");
    });

    // ---------------------------------------------------------------------------
    // Lowering flag is a no-op in Phase 1 — both contexts produce identical output
    // ---------------------------------------------------------------------------

    it("lowering flag does not affect output (representative case: empty string)", () => {
      const buildResult = parseTagArgument("uniqueItems", "", "build");
      const snapshotResult = parseTagArgument("uniqueItems", "", "snapshot");
      expect(buildResult).toEqual(snapshotResult);
    });
  });

  describe("string family (@pattern)", () => {
    // ---------------------------------------------------------------------------
    // Local helpers
    // ---------------------------------------------------------------------------

    /** Assert that the result is an ok string value equal to `expected`. */
    function expectPatternString(rawText: string, expected: string): void {
      const result = parseTagArgument("pattern", rawText, "build");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ kind: "string", value: expected });
      }
    }

    // ---------------------------------------------------------------------------
    // Valid inputs → string
    // ---------------------------------------------------------------------------

    it("bare pattern string", () => {
      expectPatternString("^[A-Z]{3}$", "^[A-Z]{3}$");
    });

    it("quoted pattern string — quotes are preserved (opaque pass-through)", () => {
      expectPatternString('"quoted"', '"quoted"');
    });

    it("unclosed character class → INVALID_REGEX_PATTERN (002 §3.2)", () => {
      // Regression for #513: `[unclosed` used to pass through as an opaque string,
      // reaching the schema's `pattern` keyword and crashing any validator at
      // schema-compile time. The extractor now compiles via `new RegExp` and rejects.
      const result = parseTagArgument("pattern", "[unclosed", "build");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("INVALID_REGEX_PATTERN");
        expect(result.diagnostic.message).toContain("[unclosed");
      }
    });

    it("pattern with surrounding whitespace → trimmed", () => {
      expectPatternString("  .*  ", ".*");
    });

    // ---------------------------------------------------------------------------
    // Invalid inputs → MISSING_TAG_ARGUMENT
    // ---------------------------------------------------------------------------

    it("empty string → MISSING_TAG_ARGUMENT", () => {
      const result = parseTagArgument("pattern", "", "build");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("MISSING_TAG_ARGUMENT");
        expect(result.diagnostic.message).toMatch(/^Expected/);
      }
    });

    it("whitespace-only → MISSING_TAG_ARGUMENT (trims to empty)", () => {
      const result = parseTagArgument("pattern", "   ", "build");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("MISSING_TAG_ARGUMENT");
      }
    });

    // ---------------------------------------------------------------------------
    // Lowering flag is a no-op in Phase 1
    // ---------------------------------------------------------------------------

    it("lowering flag does not affect output (representative case: bare pattern)", () => {
      const buildResult = parseTagArgument("pattern", "^[A-Z]{3}$", "build");
      const snapshotResult = parseTagArgument("pattern", "^[A-Z]{3}$", "snapshot");
      expect(buildResult).toEqual(snapshotResult);
    });
  });

  describe("json-array (@enumOptions)", () => {
    function expectJsonArray(text: string, expected: readonly unknown[]): void {
      const result = parseTagArgument("enumOptions", text, "build");
      expect(result.ok, `expected ok=true for input: ${JSON.stringify(text)}`).toBe(true);
      if (result.ok) {
        expect(result.value.kind).toBe("json-array");
        if (result.value.kind === "json-array") {
          expect(result.value.value).toEqual(expected);
        }
      }
    }

    function expectInvalidEnumOptions(text: string): void {
      const result = parseTagArgument("enumOptions", text, "build");
      expect(result.ok, `expected ok=false for input: ${JSON.stringify(text)}`).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("INVALID_TAG_ARGUMENT");
        expect(result.diagnostic.message).toMatch(/^Expected/);
        expect(result.diagnostic.message).toContain("@enumOptions");
      }
    }

    it("parses a string array", () => {
      expectJsonArray('["a","b"]', ["a", "b"]);
    });
    it("parses a number array", () => {
      expectJsonArray("[1,2,3]", [1, 2, 3]);
    });
    it("preserves heterogeneous array without member filtering", () => {
      expectJsonArray('[1, "two", {"id": "three"}]', [1, "two", { id: "three" }]);
    });
    it("accepts an empty array", () => {
      expectJsonArray("[]", []);
    });
    it("rejects a scalar number", () => {
      expectInvalidEnumOptions("5");
    });
    it("rejects a JSON object", () => {
      expectInvalidEnumOptions("{}");
    });
    it("rejects a JSON string", () => {
      expectInvalidEnumOptions('"string"');
    });
    it("rejects malformed JSON", () => {
      expectInvalidEnumOptions("[1,");
    });
    it("returns MISSING_TAG_ARGUMENT for empty string", () => {
      const result = parseTagArgument("enumOptions", "", "build");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("MISSING_TAG_ARGUMENT");
        expect(result.diagnostic.message).toContain("@enumOptions");
      }
    });
    it("returns MISSING_TAG_ARGUMENT for whitespace-only string", () => {
      const result = parseTagArgument("enumOptions", "   ", "build");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("MISSING_TAG_ARGUMENT");
      }
    });
    it("lowering flag produces identical output for both consumers (Phase 1 no-op)", () => {
      const buildResult = parseTagArgument("enumOptions", '["x"]', "build");
      const snapshotResult = parseTagArgument("enumOptions", '["x"]', "snapshot");
      expect(buildResult).toEqual(snapshotResult);
    });
  });

  describe("json-value-with-fallback (@const)", () => {
    function expectJsonValue(text: string, expected: unknown): void {
      const result = parseTagArgument("const", text, "build");
      expect(result.ok, `expected ok=true for input: ${JSON.stringify(text)}`).toBe(true);
      if (result.ok) {
        expect(result.value.kind).toBe("json-value");
        if (result.value.kind === "json-value") {
          expect(result.value.value).toEqual(expected);
        }
      }
    }

    function expectRawFallback(text: string, expected: string): void {
      const result = parseTagArgument("const", text, "build");
      // Raw-string fallback is a SUCCESSFUL outcome (ok: true), not a diagnostic.
      expect(
        result.ok,
        `expected ok=true (raw-string fallback) for input: ${JSON.stringify(text)}`
      ).toBe(true);
      if (result.ok) {
        expect(result.value.kind).toBe("raw-string-fallback");
        if (result.value.kind === "raw-string-fallback") {
          expect(result.value.value).toBe(expected);
        }
      }
    }

    it("parses a number", () => {
      expectJsonValue("42", 42);
    });
    it("parses a quoted string", () => {
      expectJsonValue('"USD"', "USD");
    });
    it("parses boolean true", () => {
      expectJsonValue("true", true);
    });
    it("parses boolean false", () => {
      expectJsonValue("false", false);
    });
    it("parses null", () => {
      expectJsonValue("null", null);
    });
    it("parses a JSON object", () => {
      expectJsonValue('{"a":1}', { a: 1 });
    });
    it("parses a JSON array", () => {
      expectJsonValue("[1,2,3]", [1, 2, 3]);
    });
    it("parses a Unicode escape sequence in a string", () => {
      expectJsonValue('"\\u00e9"', "é");
    });
    it("falls back to raw string for non-JSON text", () => {
      expectRawFallback("not-json", "not-json");
    });
    it("falls back to raw string for version-like text", () => {
      expectRawFallback("1.2.3", "1.2.3");
    });
    it("falls back to raw string for trailing-comma array (invalid JSON)", () => {
      expectRawFallback("[1,2,]", "[1,2,]");
    });
    it("rejects unterminated JSON-shaped arrays", () => {
      const result = parseTagArgument("const", "[\n1,\n2", "build");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("INVALID_TAG_ARGUMENT");
        expect(result.diagnostic.message).toContain("@const");
      }
    });
    it("rejects unterminated JSON-shaped objects", () => {
      const result = parseTagArgument("const", '{"a": 1', "build");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("INVALID_TAG_ARGUMENT");
      }
    });
    it.each(["[}", '{"a": ]'])("rejects mismatched JSON-shaped delimiters (%s)", (text) => {
      const result = parseTagArgument("const", text, "build");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("INVALID_TAG_ARGUMENT");
      }
    });
    it("returns MISSING_TAG_ARGUMENT for empty string", () => {
      const result = parseTagArgument("const", "", "build");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("MISSING_TAG_ARGUMENT");
        expect(result.diagnostic.message).toContain("@const");
      }
    });
    it("returns MISSING_TAG_ARGUMENT for whitespace-only string", () => {
      const result = parseTagArgument("const", "   ", "build");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("MISSING_TAG_ARGUMENT");
      }
    });
    it("lowering flag produces identical output for both consumers (Phase 1 no-op)", () => {
      const buildResult = parseTagArgument("const", "42", "build");
      const snapshotResult = parseTagArgument("const", "42", "snapshot");
      expect(buildResult).toEqual(snapshotResult);
    });
  });

  // ---------------------------------------------------------------------------
  // Slice D: canaries (silent-acceptance regression guards)
  // ---------------------------------------------------------------------------
  describe("canaries (silent-acceptance regression guards)", () => {
    // -----------------------------------------------------------------------
    // Re-assertions of known-invalid cases from Slices A/B/C.
    // These act as canaries: if a future refactor accidentally accepts these
    // inputs, exactly these tests will fail, making the regression obvious.
    // -----------------------------------------------------------------------

    it('@minimum "hello" → INVALID_NUMERIC_VALUE (numeric-family canary)', () => {
      const result = parseTagArgument("minimum", "hello", "build");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("INVALID_NUMERIC_VALUE");
      }
    });

    it("@enumOptions 5 → INVALID_TAG_ARGUMENT (Slice C canary)", () => {
      const result = parseTagArgument("enumOptions", "5", "build");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("INVALID_TAG_ARGUMENT");
      }
    });

    it('@pattern 42 → ok with kind:string value:"42" (opaque pass-through per Slice B — pin to detect future tightening)', () => {
      // Per §3 of the retirement plan: @pattern is an opaque string pass-through.
      // A numeric argument like "42" is accepted verbatim as the string "42".
      // If a future change tightens this (e.g. adds numeric rejection), this
      // test will fail and force a review of the semantics change.
      const result = parseTagArgument("pattern", "42", "build");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ kind: "string", value: "42" });
      }
    });

    it("@uniqueItems false → INVALID_TAG_ARGUMENT (Slice B canary)", () => {
      const result = parseTagArgument("uniqueItems", "false", "build");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("INVALID_TAG_ARGUMENT");
      }
    });

    it('@const "" (empty) → MISSING_TAG_ARGUMENT (Slice C canary)', () => {
      const result = parseTagArgument("const", "", "build");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("MISSING_TAG_ARGUMENT");
      }
    });

    it('@minimum "0x10" → INVALID_NUMERIC_VALUE (decimal-only guard)', () => {
      const result = parseTagArgument("minimum", "0x10", "build");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("INVALID_NUMERIC_VALUE");
      }
    });

    it("does NOT handle path-target prefixes (stripping is parseTagSyntax's job)", () => {
      // The parser expects "effectiveText" (post-strip). If a caller erroneously
      // passes "some/path: 10" directly, the parser treats the whole string as
      // the numeric argument and rejects it as a non-finite numeric value.
      const result = parseTagArgument("minimum", "some/path: 10", "build");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("INVALID_NUMERIC_VALUE");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Slice D: cross-family invariants
  // ---------------------------------------------------------------------------
  describe("cross-family invariants", () => {
    // -----------------------------------------------------------------------
    // 2a. Every built-in constraint tag produces SOMETHING (ok:true) for valid input
    // -----------------------------------------------------------------------
    it("every built-in tag returns ok:true for its family's canonical valid input", () => {
      // Valid-input mapping per family — one representative per family that
      // a correctly-implemented parser must accept.
      // Typed as Record<TagFamily, string> so a new family forces a compile error here.
      const validInputByFamily: Record<TagFamily, string> = {
        numeric: "10",
        length: "10",
        "boolean-marker": "", // empty → marker
        string: "^abc$",
        "json-array": '["a"]',
        "json-value-with-fallback": "42",
      };

      for (const tag of Object.keys(TAG_ARGUMENT_FAMILIES)) {
        const family = TAG_ARGUMENT_FAMILIES[tag as keyof typeof TAG_ARGUMENT_FAMILIES];
        const validInput = validInputByFamily[family];
        const result = parseTagArgument(tag, validInput, "build");
        expect(
          result.ok,
          `Expected ok:true for @${tag} (family "${family}") with input ${JSON.stringify(validInput)}`
        ).toBe(true);
      }
    });

    // -----------------------------------------------------------------------
    // 2b. Every family rejects bogus input — no silent acceptance, no throw
    // -----------------------------------------------------------------------
    it("every family rejects a bad input without throwing, producing ok:false or raw-string-fallback", () => {
      // Bad-input mapping per family — inputs that should be rejected (or fall back).
      // For json-value-with-fallback (@const), "nope" falls back to raw-string
      // (ok:true, kind:"raw-string-fallback"), which is the accepted path.
      // Typed as Record<TagFamily, string> so a new family forces a compile error here.
      const badInputByFamily: Record<TagFamily, string> = {
        numeric: "abc",
        length: "abc",
        "boolean-marker": "false",
        string: "", // empty → MISSING
        "json-array": "5", // scalar, not array
        "json-value-with-fallback": "nope", // falls back to raw-string
      };

      // Pick one representative tag per family.
      // Typed as Record<TagFamily, string> so a new family forces a compile error here.
      const repTagByFamily: Record<TagFamily, string> = {
        numeric: "minimum",
        length: "minLength",
        "boolean-marker": "uniqueItems",
        string: "pattern",
        "json-array": "enumOptions",
        "json-value-with-fallback": "const",
      };

      for (const [family, badInput] of Object.entries(badInputByFamily) as [TagFamily, string][]) {
        const tag = repTagByFamily[family];
        let result: ReturnType<typeof parseTagArgument> | undefined;
        expect(() => {
          result = parseTagArgument(tag, badInput, "build");
        }, `parseTagArgument(@${tag}, "${badInput}") must not throw`).not.toThrow();

        // Guard: result must be assigned (the call didn't throw)
        expect(
          result,
          `parseTagArgument(@${tag}, "${badInput}") must return a result`
        ).toBeDefined();

        if (result === undefined) continue;

        if (family === "json-value-with-fallback") {
          // @const "nope" falls back — ok:true with raw-string-fallback is the accepted path.
          // Assert ok:true unconditionally first so a regression to ok:false is caught
          // even if the kind check is never reached.
          expect(
            result.ok,
            `@const fallback for "${badInput}" must produce ok:true (raw-string-fallback)`
          ).toBe(true);
          if (result.ok) {
            expect(
              result.value.kind,
              `@const fallback must produce raw-string-fallback, got kind "${result.value.kind}"`
            ).toBe("raw-string-fallback");
          }
        } else {
          // All other families must produce ok:false with a diagnostic
          expect(
            result.ok,
            `Expected ok:false for @${tag} (family "${family}") with bad input "${badInput}"`
          ).toBe(false);
          if (!result.ok) {
            // Guard: must not produce a marker for a family that shouldn't produce one
            // (e.g., json-array returning a marker would be a cross-family contamination bug)
            expect(
              result.diagnostic.code,
              `Expected a recognized diagnostic code for @${tag}`
            ).toMatch(
              /^(INVALID_TAG_ARGUMENT|MISSING_TAG_ARGUMENT|UNKNOWN_TAG|INVALID_NUMERIC_VALUE|INVALID_NON_NEGATIVE_INTEGER|INVALID_REGEX_PATTERN)$/
            );
          }
        }
      }
    });

    // -----------------------------------------------------------------------
    // 2c. Unknown tag name never crashes for any input
    // -----------------------------------------------------------------------
    it("unknown tag name produces UNKNOWN_TAG for all diverse inputs, never throws", () => {
      const diverseInputs = ["", "42", "   ", "null", "__proto__"];
      for (const input of diverseInputs) {
        const result = parseTagArgument("notARealTag", input, "build");
        expect(
          result.ok,
          `Expected ok:false for unknown tag with input ${JSON.stringify(input)}`
        ).toBe(false);
        if (!result.ok) {
          expect(
            result.diagnostic.code,
            `Expected UNKNOWN_TAG for unknown tag with input ${JSON.stringify(input)}`
          ).toBe("UNKNOWN_TAG");
        }
      }
    });

    // -----------------------------------------------------------------------
    // 2d. Prototype-pollution guard: method names produce UNKNOWN_TAG
    // -----------------------------------------------------------------------
    it("prototype method names produce UNKNOWN_TAG, not throw", () => {
      const poisonNames = ["toString", "hasOwnProperty", "__proto__", "constructor"];
      for (const name of poisonNames) {
        const result = parseTagArgument(name, "42", "build");
        expect(result.ok, `Expected ok:false for poisoned tag name "${name}"`).toBe(false);
        if (!result.ok) {
          expect(
            result.diagnostic.code,
            `Expected UNKNOWN_TAG for poisoned tag name "${name}", got "${result.diagnostic.code}"`
          ).toBe("UNKNOWN_TAG");
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Slice D: exhaustive registry sweep (13 tags × 3 inputs)
  // ---------------------------------------------------------------------------
  describe("exhaustive registry sweep", () => {
    it("every tag × {empty, '42', 'not-json-at-all'} combination never throws and always returns a typed result", () => {
      const inputs = ["", "42", "not-json-at-all"] as const;

      for (const tag of Object.keys(TAG_ARGUMENT_FAMILIES)) {
        for (const input of inputs) {
          let result: ReturnType<typeof parseTagArgument> | undefined;
          expect(
            () => {
              result = parseTagArgument(tag, input, "build");
            },
            `parseTagArgument(@${tag}, ${JSON.stringify(input)}) must not throw`
          ).not.toThrow();

          // Result must be defined (the call didn't throw)
          expect(
            result,
            `parseTagArgument(@${tag}, ${JSON.stringify(input)}) must return a result`
          ).toBeDefined();

          if (result !== undefined) {
            // Exactly one of ok:true or ok:false — the discriminated union guarantees this,
            // but we assert it explicitly to guard against a future refactor that returns
            // a plain object without the `ok` field.
            expect(
              typeof result.ok,
              `result.ok for @${tag} ${JSON.stringify(input)} must be boolean`
            ).toBe("boolean");

            if (result.ok) {
              // Verify the value has a recognized kind
              expect(
                [
                  "number",
                  "string",
                  "boolean",
                  "marker",
                  "json-array",
                  "json-value",
                  "raw-string-fallback",
                ],
                `result.value.kind for @${tag} ${JSON.stringify(input)} must be a recognized kind`
              ).toContain(result.value.kind);
            } else {
              // Verify the diagnostic has a recognized code
              expect(
                [
                  "INVALID_TAG_ARGUMENT",
                  "MISSING_TAG_ARGUMENT",
                  "UNKNOWN_TAG",
                  "INVALID_NUMERIC_VALUE",
                  "INVALID_NON_NEGATIVE_INTEGER",
                  "INVALID_REGEX_PATTERN",
                ],
                `result.diagnostic.code for @${tag} ${JSON.stringify(input)} must be a recognized code`
              ).toContain(result.diagnostic.code);
            }
          }
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// extractEffectiveArgumentText unit tests (Phase 4B)
// ---------------------------------------------------------------------------

/**
 * Helper: build a ParsedCommentTag for a simple `@<tagName> <payload>` comment.
 * The full comment is wrapped with leading-whitespace-stripped payload so that
 * parseCommentBlock can parse it and extract argumentText correctly.
 */
function parsedTagFor(
  tagName: string,
  payload: string
): ReturnType<typeof parseCommentBlock>["tags"][number] {
  const sep = payload === "" || payload.startsWith(" ") ? "" : " ";
  const block = parseCommentBlock(`/** @${tagName}${sep}${payload} */`);
  const tag = block.tags[0];
  if (tag === undefined) {
    throw new Error(
      `Failed to parse comment tag @${tagName} with payload ${JSON.stringify(payload)}`
    );
  }
  return tag;
}

describe("extractEffectiveArgumentText", () => {
  // -------------------------------------------------------------------------
  // Case 1: Standard path — parsedTag non-null, rawText = full payload
  //
  // When parsedTag is provided, the helper calls parseTagSyntax(tagName, rawText)
  // which strips the path-target prefix and returns the pure argument text.
  // For simple payloads (no target prefix), the result equals the argumentText
  // the caller would get from tag.argumentText directly.
  // -------------------------------------------------------------------------
  describe("case 1: parsedTag non-null (standard path)", () => {
    it("strips path-target prefix from rawText for a path-targeted tag", () => {
      // rawText includes the path-target prefix `:amount`; tag.argumentText would
      // only have the value part. The helper must produce just the argument (e.g. "0").
      const tag = parsedTagFor("minimum", ":amount 0");
      // tag.argumentText is already target-stripped by parseCommentBlock
      expect(tag.argumentText).toBe("0");
      // helper should produce the same result when rawText = full payload
      const result = extractEffectiveArgumentText("minimum", ":amount 0", tag);
      expect(result).toBe("0");
    });

    it("returns the plain argument text for a direct (non-path-targeted) tag", () => {
      const tag = parsedTagFor("minimum", "42");
      expect(tag.argumentText).toBe("42");
      const result = extractEffectiveArgumentText("minimum", "42", tag);
      expect(result).toBe("42");
    });

    it("handles TAGS_REQUIRING_RAW_TEXT (@pattern) rawText correctly", () => {
      // For @pattern, rawText is the raw span text (e.g. from choosePreferredPayloadText).
      // parseTagSyntax re-parses it to extract the argument.
      const tag = parsedTagFor("pattern", "^abc@def$");
      const result = extractEffectiveArgumentText("pattern", "^abc@def$", tag);
      // The argument is the text after stripping any prefix (none here).
      expect(result).toBe("^abc@def$");
    });

    it("handles empty argument (e.g. @uniqueItems with no value)", () => {
      const tag = parsedTagFor("uniqueItems", "");
      const result = extractEffectiveArgumentText("uniqueItems", "", tag);
      expect(result).toBe("");
    });

    it("snapshot consumer path: rawText = tag.argumentText, already target-stripped", () => {
      // In the snapshot consumer, rawText IS tag.argumentText (already stripped).
      // parseTagSyntax(tagName, tag.argumentText).argumentText must equal
      // tag.argumentText — the helper is a pass-through in this case.
      const tag = parsedTagFor("minimum", "100");
      const result = extractEffectiveArgumentText("minimum", tag.argumentText, tag);
      expect(result).toBe(tag.argumentText);
    });
  });

  // -------------------------------------------------------------------------
  // Case 2 (orphaned fallback): parsedTag null — fall back to rawText directly
  //
  // When the unified parser fails to produce a tag object but a raw-text
  // fallback from ts.getJSDocTags() is recovered, parsedTag is null and
  // rawText is the raw text from the compiler API. The helper must return it
  // as-is — there is nothing to re-parse.
  // -------------------------------------------------------------------------
  describe("case 2: parsedTag null (orphaned fallback path)", () => {
    it("returns rawText directly when parsedTag is null", () => {
      const result = extractEffectiveArgumentText("minimum", "99", null);
      expect(result).toBe("99");
    });

    it("returns rawText for TAGS_REQUIRING_RAW_TEXT when parsedTag is null", () => {
      const result = extractEffectiveArgumentText("pattern", "^[0-9]+$", null);
      expect(result).toBe("^[0-9]+$");
    });

    it("returns empty string when rawText is empty and parsedTag is null", () => {
      const result = extractEffectiveArgumentText("uniqueItems", "", null);
      expect(result).toBe("");
    });
  });
});

// Suppress unused-import lint for TagArgumentValue — it is imported here so
// that Slices A/B/C can reference it in tests without adding a new import.
type _TagArgumentValueUnused = TagArgumentValue;
// Suppress unused-import lint for TagArgumentLowering.
type _TagArgumentLoweringUnused = TagArgumentLowering;
