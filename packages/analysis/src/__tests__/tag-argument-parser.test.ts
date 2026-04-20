import { describe, expect, it } from "vitest";
import { BUILTIN_CONSTRAINT_DEFINITIONS } from "@formspec/core/internals";
import {
  type TagArgumentLowering,
  parseTagArgument,
  TAG_ARGUMENT_FAMILIES,
  type TagArgumentValue,
} from "../tag-argument-parser.js";

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
 * Asserts that parseTagArgument returns `{ ok: false, code: "INVALID_TAG_ARGUMENT" }`
 * with a message that starts with "Expected " (required bridge convention for Phase 2/3
 * consumer classifier per §1.7 of the retirement plan).
 */
function expectInvalidArgument(tag: string, text: string): void {
  const result = parseTagArgument(tag, text, "build");
  expect(result.ok, `Expected ok:false for @${tag} "${text}"`).toBe(false);
  if (!result.ok) {
    expect(result.diagnostic.code).toBe("INVALID_TAG_ARGUMENT");
    expect(result.diagnostic.message).toMatch(/^Expected /);
    expect(result.diagnostic.message).toContain("numeric literal");
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseTagArgument", () => {
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

    it("all diagnostics from implemented families start with 'Expected '", () => {
      // Enforces the "Expected " prefix convention documented in TagArgumentDiagnostic.
      // The classifier in file-snapshots.ts (~line 1480) relies on this prefix to
      // remain valid until Phase 2/3 wiring shifts it to test `code` directly.
      //
      // ADD ONE CASE HERE per newly-implemented family when each Slice lands.
      // Each entry should use an invalid argument that produces a diagnostic.
      const cases: { tag: string; raw: string; description: string }[] = [
        // boolean-marker family (@uniqueItems) — INVALID_TAG_ARGUMENT
        { tag: "uniqueItems", raw: "false", description: "@uniqueItems with 'false'" },
        // string family (@pattern) — MISSING_TAG_ARGUMENT (empty is the only invalid case)
        { tag: "pattern", raw: "", description: "@pattern with empty string" },
      ];

      for (const { tag, raw, description } of cases) {
        const result = parseTagArgument(tag, raw, "build");
        expect(result.ok, `expected failure for ${description}`).toBe(false);
        if (!result.ok) {
          expect(
            result.diagnostic.message,
            `message for ${description} must start with "Expected "`,
          ).toMatch(/^Expected /);
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

      it("accepts Infinity (pins §3 divergence behavior — snapshot path passes through)", () => {
        expectNumericValue("minimum", "Infinity", Infinity);
      });

      it("accepts -Infinity", () => {
        expectNumericValue("minimum", "-Infinity", -Infinity);
      });

      it("accepts NaN (pins §3 divergence behavior — snapshot path passes through)", () => {
        // NaN !== NaN, so we cannot use expectNumericValue's toEqual branch here.
        // The helper uses Number.isNaN internally for this case.
        expectNumericValue("minimum", "NaN", NaN);
      });

      it("returns MISSING_TAG_ARGUMENT for empty string", () => {
        expectMissingArgument("minimum", "");
      });

      it("returns MISSING_TAG_ARGUMENT for whitespace-only string", () => {
        expectMissingArgument("minimum", "   ");
      });

      it("returns INVALID_TAG_ARGUMENT for alphabetic text", () => {
        expectInvalidArgument("minimum", "hello");
      });

      it("returns INVALID_TAG_ARGUMENT for numeric text with invalid suffix", () => {
        expectInvalidArgument("minimum", "10x");
      });

      it("includes tag name in INVALID_TAG_ARGUMENT message", () => {
        const result = parseTagArgument("minimum", "hello", "build");
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.diagnostic.message).toContain("@minimum");
        }
      });

      it("includes the bad text in INVALID_TAG_ARGUMENT message", () => {
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
          expect(result.diagnostic.code).toBe("INVALID_TAG_ARGUMENT");
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
          expect(result.diagnostic.code).toBe("INVALID_TAG_ARGUMENT");
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
          expect(result.diagnostic.code).toBe("INVALID_TAG_ARGUMENT");
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
          expect(result.diagnostic.code).toBe("INVALID_TAG_ARGUMENT");
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

      it("parses a float — integer erasure, NOT rejected (Role D concern, not Role C)", () => {
        // Key invariant from §1.6: integer erasure means @minLength 1.5 must
        // return ok:true with value 1.5. The consumer may later cast to integer,
        // but the parser must not reject it.
        expectNumericValue("minLength", "1.5", 1.5);
      });

      it("accepts Infinity", () => {
        expectNumericValue("minLength", "Infinity", Infinity);
      });

      it("accepts -Infinity", () => {
        expectNumericValue("minLength", "-Infinity", -Infinity);
      });

      it("accepts NaN", () => {
        expectNumericValue("minLength", "NaN", NaN);
      });

      it("returns MISSING_TAG_ARGUMENT for empty string", () => {
        expectMissingArgument("minLength", "");
      });

      it("returns MISSING_TAG_ARGUMENT for whitespace-only string", () => {
        expectMissingArgument("minLength", "   ");
      });

      it("returns INVALID_TAG_ARGUMENT for alphabetic text", () => {
        expectInvalidArgument("minLength", "hello");
      });

      it("returns INVALID_TAG_ARGUMENT for numeric text with invalid suffix", () => {
        expectInvalidArgument("minLength", "10x");
      });

      it("includes tag name in INVALID_TAG_ARGUMENT message", () => {
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
          expect(result.diagnostic.code).toBe("INVALID_TAG_ARGUMENT");
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
          expect(result.diagnostic.code).toBe("INVALID_TAG_ARGUMENT");
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
          expect(result.diagnostic.code).toBe("INVALID_TAG_ARGUMENT");
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

    it("unclosed bracket — no regex compile, returned opaque", () => {
      expectPatternString("[unclosed", "[unclosed");
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

  // Slice C owns these — tests land in Slice C.
  describe("json-array (@enumOptions)", () => {
    it.todo("Slice C");
  });
  describe("json-value-with-fallback (@const)", () => {
    it.todo("Slice C");
  });

  // Slice D owns this — tests land in Slice D.
  describe("canaries (silent-acceptance regression guards)", () => {
    it.todo("Slice D");
  });
});

// Suppress unused-import lint for TagArgumentValue — it is imported here so
// that Slices A/B/C can reference it in tests without adding a new import.
type _TagArgumentValueUnused = TagArgumentValue;
// Suppress unused-import lint for TagArgumentLowering.
type _TagArgumentLoweringUnused = TagArgumentLowering;
