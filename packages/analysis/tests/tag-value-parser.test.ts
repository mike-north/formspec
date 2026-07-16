import type { ConstraintTagParseRegistryLike } from "../src/tag-value-parser.js";
import { describe, expect, it } from "vitest";
import { parseConstraintTagValue, parseExampleTagValue } from "../src/internal.js";

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

  // ---------------------------------------------------------------------------
  // Constraint-value validation (issue #513, spec 002 §3.2)
  //
  // The IR-producing path now shares the typed-argument validator, so a value the
  // extractor rejects produces NO constraint node — the invalid keyword never
  // reaches the generated schema. Each expected value is derived from the spec's
  // per-tag grammar (§3.2), not from current program output.
  // ---------------------------------------------------------------------------
  describe("rejects invalid constraint values → no constraint node (issue #513)", () => {
    it.each([
      // family, tag, bad input — 002 §3.2 rejects each of these
      ["numeric non-finite", "minimum", "Infinity"],
      ["numeric overflow", "maximum", "1e999"],
      ["numeric non-decimal", "minimum", "0x10"],
      ["numeric NaN", "minimum", "NaN"],
      ["length negative", "minLength", "-5"],
      ["length fractional", "maxItems", "2.5"],
      ["pattern uncompilable", "pattern", "("],
    ])("%s: @%s %s produces no constraint node", (_family, tag, badInput) => {
      expect(parseConstraintTagValue(tag, badInput, PROVENANCE)).toBeNull();
    });
  });

  describe("accepts valid constraint values → constraint node (issue #513 positive cases)", () => {
    it("numeric: @minimum -3.14 → finite numeric bound", () => {
      expect(parseConstraintTagValue("minimum", "-3.14", PROVENANCE)).toEqual({
        kind: "constraint",
        constraintKind: "minimum",
        value: -3.14,
        provenance: PROVENANCE,
      });
    });

    it("length: @minLength 0 → non-negative integer bound", () => {
      expect(parseConstraintTagValue("minLength", "0", PROVENANCE)).toEqual({
        kind: "constraint",
        constraintKind: "minLength",
        value: 0,
        provenance: PROVENANCE,
      });
    });

    it("pattern: @pattern ^[A-Z]{3}$ → compilable pattern constraint", () => {
      expect(parseConstraintTagValue("pattern", "^[A-Z]{3}$", PROVENANCE)).toEqual({
        kind: "constraint",
        constraintKind: "pattern",
        pattern: "^[A-Z]{3}$",
        provenance: PROVENANCE,
      });
    });
  });

  // @example value parsing — spec 002 §3.2: "The value of each entry is parsed
  // as JSON; if JSON parsing fails, the text is stored as a string."
  describe("parseExampleTagValue (@example, spec 002 §3.2)", () => {
    const EX_PROV = { ...PROVENANCE, tagName: "@example" };

    it("parses a JSON object payload to its value", () => {
      const parsed = parseExampleTagValue('{"host": "localhost", "port": 5432}', EX_PROV);
      expect(parsed).toEqual({
        kind: "annotation",
        annotationKind: "example",
        value: { host: "localhost", port: 5432 },
        provenance: EX_PROV,
      });
    });

    it("parses a JSON array payload to its value", () => {
      const parsed = parseExampleTagValue("[1, 2, 3]", EX_PROV);
      expect(parsed.annotationKind).toBe("example");
      expect(parsed).toMatchObject({ value: [1, 2, 3] });
    });

    it("parses a bare number payload to a number", () => {
      expect(parseExampleTagValue("42", EX_PROV)).toMatchObject({ value: 42 });
    });

    it("parses a bare boolean payload to a boolean", () => {
      expect(parseExampleTagValue("true", EX_PROV)).toMatchObject({ value: true });
    });

    it("preserves a literal JSON null as null (not a parse failure)", () => {
      // JSON.parse("null") succeeds and yields null; it must not be conflated
      // with a parse failure that would otherwise stringify the text.
      const parsed = parseExampleTagValue("null", EX_PROV);
      expect(parsed).toMatchObject({ annotationKind: "example", value: null });
    });

    it("unwraps a quoted JSON string to the string value", () => {
      expect(parseExampleTagValue('"already a string"', EX_PROV)).toMatchObject({
        value: "already a string",
      });
    });

    it("carries a non-JSON payload through as a raw string", () => {
      // "user@example.com" is not valid JSON, so it is stored verbatim.
      expect(parseExampleTagValue("user@example.com", EX_PROV)).toMatchObject({
        value: "user@example.com",
      });
    });

    it("trims surrounding whitespace before parsing", () => {
      expect(parseExampleTagValue("   7   ", EX_PROV)).toMatchObject({ value: 7 });
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

    it("parses multi-line JSON arrays (@const [\\n1,\\n2\\n])", () => {
      const parsed = parseConstraintTagValue("const", "[\n1,\n2\n]", PROVENANCE);

      expect(parsed).not.toBeNull();
      expect(parsed).toEqual({
        kind: "constraint",
        constraintKind: "const",
        value: [1, 2],
        provenance: PROVENANCE,
      });
    });

    it("rejects unterminated JSON-shaped @const payloads", () => {
      const parsed = parseConstraintTagValue("const", "[\n1,\n2", PROVENANCE);

      expect(parsed).toBeNull();
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

    it('successfully parses Unicode escape sequences in strings (@const "\\u00e9")', () => {
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

  describe("path-targeted broadening (issue #395)", () => {
    // Regression tests for the contract between the build consumer and the
    // analysis layer: when a constraint tag carries a path target
    // (`@minimum :amount 1.25`), the field's own IR type describes the wrong
    // thing. The build consumer is the only layer with compiler-level access
    // to resolve what type the terminal path segment points at, and it
    // communicates that via `pathResolvedCustomTypeId`. Without this option,
    // path-targeted constraints on custom types (e.g. Decimal-valued
    // sub-fields) emit raw numeric constraints, which are invalid under JSON
    // Schema 2020-12 when the terminal type is not numeric.

    it("broadens path-targeted built-in tags onto the path-resolved custom type", () => {
      const parsed = parseConstraintTagValue("minimum", ":amount 1.25", PROVENANCE, {
        registry: createRegistry(),
        pathResolvedCustomTypeId: "Decimal",
      });

      expect(parsed).toEqual({
        kind: "constraint",
        constraintKind: "custom",
        constraintId: "x-test/decimal/MinScaled",
        payload: 125,
        compositionRule: "override",
        path: { segments: ["amount"] },
        provenance: PROVENANCE,
      });
    });

    it("falls back to a raw numeric constraint when pathResolvedCustomTypeId is omitted", () => {
      // Without the build-consumer-supplied type ID, the analysis layer has
      // no way to look up broadening for the path-resolved terminal type.
      // Emitting a raw NumericConstraintNode is the documented fallback
      // behavior (the build consumer is responsible for path-aware broadening).
      const parsed = parseConstraintTagValue("minimum", ":amount 1.25", PROVENANCE, {
        registry: createRegistry(),
      });

      expect(parsed).toEqual({
        kind: "constraint",
        constraintKind: "minimum",
        value: 1.25,
        path: { segments: ["amount"] },
        provenance: PROVENANCE,
      });
    });

    it("falls back to a raw numeric constraint when the tag has no broadening registration", () => {
      // The fixture registry only registers `Decimal` + `minimum`. When the
      // terminal type has a registered custom type ID but no broadening for
      // this specific tag, behavior must match "no broadening" — a raw
      // NumericConstraintNode with the path preserved.
      const parsed = parseConstraintTagValue("maximum", ":amount 10", PROVENANCE, {
        registry: createRegistry(),
        pathResolvedCustomTypeId: "Decimal",
      });

      expect(parsed).toEqual({
        kind: "constraint",
        constraintKind: "maximum",
        value: 10,
        path: { segments: ["amount"] },
        provenance: PROVENANCE,
      });
    });

    it("direct (non-path) tags still use fieldType, ignoring pathResolvedCustomTypeId", () => {
      // Regression pin: passing `pathResolvedCustomTypeId` alongside a
      // direct-field tag must not shadow the existing direct-field broadening
      // path. The direct-tag case uses `fieldType` exactly as before.
      const parsed = parseConstraintTagValue("minimum", "1.25", PROVENANCE, {
        registry: createRegistry(),
        fieldType: { kind: "custom", typeId: "Decimal", payload: null },
        // This value is irrelevant for direct tags and must be ignored.
        pathResolvedCustomTypeId: "SomeOtherType",
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

    it("path-targeted tags use pathResolvedCustomTypeId, ignoring fieldType", () => {
      // When both are supplied and the tag has a path, `pathResolvedCustomTypeId`
      // wins. `fieldType` describes the enclosing field (e.g. a MonetaryAmount
      // object/reference type), which is the wrong thing to broaden against
      // for a path-targeted tag.
      const parsed = parseConstraintTagValue("minimum", ":amount 1.25", PROVENANCE, {
        registry: createRegistry(),
        // Enclosing field type — not a custom type that would broaden.
        fieldType: { kind: "reference", name: "MonetaryAmount", typeArguments: [] },
        pathResolvedCustomTypeId: "Decimal",
      });

      expect(parsed).toEqual({
        kind: "constraint",
        constraintKind: "custom",
        constraintId: "x-test/decimal/MinScaled",
        payload: 125,
        compositionRule: "override",
        path: { segments: ["amount"] },
        provenance: PROVENANCE,
      });
    });
  });
});
