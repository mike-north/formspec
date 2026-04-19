import type { ConstraintTagParseRegistryLike } from "../tag-value-parser.js";
import { describe, expect, it } from "vitest";
import { parseConstraintTagValue } from "../internal.js";

const PROVENANCE = {
  surface: "tsdoc" as const,
  file: "/virtual/formspec.ts",
  line: 1,
  column: 1,
  tagName: "@minimum",
};

function createRegistry(): ConstraintTagParseRegistryLike {
  return {
    extensions: [],
    findConstraint(constraintId) {
      if (constraintId === "x-test/numeric/MaxSigFig") {
        return {
          constraintName: "MaxSigFig",
          applicableTypes: null,
          compositionRule: "override",
          toJsonSchema() {
            return {};
          },
        };
      }
      if (constraintId === "x-test/decimal/MinScaled") {
        return {
          constraintName: "MinScaled",
          applicableTypes: null,
          compositionRule: "override",
          toJsonSchema() {
            return {};
          },
        };
      }
      return undefined;
    },
    findConstraintTag(tagName) {
      if (tagName === "maxSigFig") {
        return {
          extensionId: "x-test/numeric",
          registration: {
            tagName: "maxSigFig",
            constraintName: "MaxSigFig",
            parseValue(raw) {
              return Number(raw.trim());
            },
          },
        };
      }
      return undefined;
    },
    findBuiltinConstraintBroadening(typeId, tagName) {
      if (typeId === "Decimal" && tagName === "minimum") {
        return {
          extensionId: "x-test/decimal",
          registration: {
            tagName: "minimum",
            constraintName: "MinScaled",
            parseValue(raw) {
              return Number(raw.trim()) * 100;
            },
          },
        };
      }
      return undefined;
    },
  };
}

describe("tag-value-parser", () => {
  it("parses builtin numeric constraints with path targets", () => {
    const parsed = parseConstraintTagValue("minimum", ":amount 0", PROVENANCE);

    expect(parsed).toEqual({
      kind: "constraint",
      constraintKind: "minimum",
      value: 0,
      path: { segments: ["amount"] },
      provenance: PROVENANCE,
    });
  });

  it("parses boolean builtin constraints with an omitted argument", () => {
    const parsed = parseConstraintTagValue("uniqueItems", "", PROVENANCE);

    expect(parsed).toEqual({
      kind: "constraint",
      constraintKind: "uniqueItems",
      value: true,
      provenance: PROVENANCE,
    });
  });

  it("falls back to a raw string for non-JSON @const payloads", () => {
    // Regression pin for §9.1 #5: bare word "not-json" is not valid JSON and must
    // produce a raw-string const node, not null and not a parse error.
    const parsed = parseConstraintTagValue("const", "not-json", PROVENANCE);

    expect(parsed).not.toBeNull();
    expect(parsed).toEqual({
      kind: "constraint",
      constraintKind: "const",
      value: "not-json",
      provenance: PROVENANCE,
    });
  });

  describe("@const raw-string fallback edge cases (§9.1 #5)", () => {
    // These tests pin the current behavior of the @const parser so that Phase 1's
    // typed parser can be validated against identical fallback rules.
    // See docs/refactors/synthetic-checker-retirement.md §9.1 #5.

    it("falls back to raw string for invalid number-like input (@const 1.2.3)", () => {
      // "1.2.3" is not valid JSON — JSON.parse throws — so the catch branch
      // must return the trimmed text verbatim as the const value.
      const parsed = parseConstraintTagValue("const", "1.2.3", PROVENANCE);

      expect(parsed).not.toBeNull();
      expect(parsed).toEqual({
        kind: "constraint",
        constraintKind: "const",
        value: "1.2.3",
        provenance: PROVENANCE,
      });
    });

    it("truncates multi-line JSON to first line and raw-string falls back (@const [\\n1,\\n2\\n])", () => {
      // parseTagSyntax operates on the first line only — newlines are treated as
      // tag-block terminators. The text reaching the JSON.parse try is "[" (just
      // the opening bracket), which fails to parse, so the catch branch returns
      // the trimmed first-line text verbatim as the const value.
      // TODO: Phase 1 typed parser should decide whether to propagate this
      // truncation or to accept multi-line spans. See
      // docs/refactors/synthetic-checker-retirement.md §9.1 #5.
      const parsed = parseConstraintTagValue("const", "[\n1,\n2\n]", PROVENANCE);

      expect(parsed).not.toBeNull();
      expect(parsed).toEqual({
        kind: "constraint",
        constraintKind: "const",
        value: "[",
        provenance: PROVENANCE,
      });
    });

    it("falls back to raw string for trailing-comma array (@const [1,2,])", () => {
      // Trailing commas are not valid JSON — JSON.parse throws — so the catch
      // branch returns the text verbatim.
      const parsed = parseConstraintTagValue("const", "[1,2,]", PROVENANCE);

      expect(parsed).not.toBeNull();
      expect(parsed).toEqual({
        kind: "constraint",
        constraintKind: "const",
        value: "[1,2,]",
        provenance: PROVENANCE,
      });
    });

    it("successfully parses Unicode escape sequences in strings (@const \"\\u00e9\")", () => {
      // JSON.parse resolves \u00e9 to "é", so the try branch wins.
      // The stored value must be the resolved character, not the escape sequence.
      const parsed = parseConstraintTagValue("const", '"\\u00e9"', PROVENANCE);

      expect(parsed).not.toBeNull();
      expect(parsed).toEqual({
        kind: "constraint",
        constraintKind: "const",
        value: "é",
        provenance: PROVENANCE,
      });
    });

    it("returns null for empty-after-trim @const payload (@const <whitespace>)", () => {
      // When trimmedText === "" the implementation returns null (no diagnostic
      // is emitted at this layer). Pinning this so Phase 1 preserves the same
      // early-return rather than treating it as an empty-string const.
      const parsed = parseConstraintTagValue("const", "   ", PROVENANCE);

      expect(parsed).toBeNull();
    });
  });

  it("parses extension-defined constraint tags through the registry", () => {
    const parsed = parseConstraintTagValue("maxSigFig", "4", PROVENANCE, {
      registry: createRegistry(),
    });

    expect(parsed).toEqual({
      kind: "constraint",
      constraintKind: "custom",
      constraintId: "x-test/numeric/MaxSigFig",
      payload: 4,
      compositionRule: "override",
      provenance: PROVENANCE,
    });
  });

  it("uses builtin broadening registrations for custom field types", () => {
    const parsed = parseConstraintTagValue("minimum", "1.25", PROVENANCE, {
      registry: createRegistry(),
      fieldType: { kind: "custom", typeId: "Decimal", payload: null },
    });

    expect(parsed).toEqual({
      kind: "constraint",
      constraintKind: "custom",
      constraintId: "x-test/decimal/MinScaled",
      payload: 125,
      compositionRule: "override",
      provenance: PROVENANCE,
    });
  });
});
