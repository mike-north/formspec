import { describe, expect, it } from "vitest";
import {
  parseTagArgument,
  TAG_ARGUMENT_FAMILIES,
  type TagArgumentValue,
} from "../tag-argument-parser.js";

describe("parseTagArgument", () => {
  describe("registry", () => {
    it("maps all 13 constraint-tag names to a family", () => {
      // Assert TAG_ARGUMENT_FAMILIES has exactly these entries.
      const expected = new Set([
        "minimum",
        "maximum",
        "exclusiveMinimum",
        "exclusiveMaximum",
        "multipleOf",
        "minLength",
        "maxLength",
        "minItems",
        "maxItems",
        "uniqueItems",
        "pattern",
        "enumOptions",
        "const",
      ]);
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

  // Slice B owns these — tests land in Slice B.
  describe("boolean-marker (@uniqueItems)", () => {
    it.todo("Slice B");
  });
  describe("string-opaque (@pattern)", () => {
    it.todo("Slice B");
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
