import { describe, expect, it } from "vitest";
import { BUILTIN_CONSTRAINT_DEFINITIONS } from "@formspec/core/internals";
import {
  parseTagArgument,
  TAG_ARGUMENT_FAMILIES,
  type TagArgumentValue,
} from "../tag-argument-parser.js";

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
  });

  // Slice A owns these — tests land in Slice A.
  describe("numeric family", () => {
    it.todo("Slice A");
  });
  describe("length family", () => {
    it.todo("Slice A");
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

  describe("string-opaque (@pattern)", () => {
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
