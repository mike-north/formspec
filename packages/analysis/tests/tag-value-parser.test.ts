/**
 * Tests for constraint tag value parsing into IR constraint nodes.
 *
 * @see ../../../docs/002-tsdoc-grammar.md §3.2 (value grammars) and §6 (diagnostic codes)
 */
import type { PrimitiveTypeNode, TypeNode } from "@formspec/core/internals";
import type { ConstraintTagParseRegistryLike } from "../src/tag-value-parser.js";
import { describe, expect, it } from "vitest";
import {
  _makeDefaultValueMismatch,
  parseConstraintTagValue,
  parseDefaultValueTagValue,
  parseExampleTagValue,
} from "../src/internal.js";

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
    // A 400-digit integer matches the length grammar but Number() overflows it to
    // Infinity; it must still produce no node (guards the length-family overflow gap).
    const lengthOverflow = "1".padEnd(400, "0");

    it.each([
      // family, tag, bad input — 002 §3.2 rejects each of these
      ["numeric non-finite", "minimum", "Infinity"],
      ["numeric overflow", "maximum", "1e999"],
      ["numeric non-decimal", "minimum", "0x10"],
      ["numeric NaN", "minimum", "NaN"],
      ["length negative", "minLength", "-5"],
      ["length fractional", "maxItems", "2.5"],
      ["length overflow to Infinity", "maxLength", lengthOverflow],
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

  // @defaultValue value parsing — spec 002 §3.2 (docs/002-tsdoc-grammar.md lines
  // 561-588): parsing is type-directed against the resolved target type.
  // Quoted JSON strings are always explicit strings; unquoted values first
  // attempt a valid non-string interpretation permitted by the target type,
  // falling back to a raw-text string only when the target type itself
  // accepts strings, and to a diagnostic-worthy mismatch otherwise
  // (GitHub issue #517).
  describe("parseDefaultValueTagValue (@defaultValue, spec 002 §3.2, issue #517)", () => {
    const DV_PROV = { ...PROVENANCE, tagName: "@defaultValue" };
    type BuiltinPrimitiveKind = PrimitiveTypeNode["primitiveKind"];

    const stringType: TypeNode = { kind: "primitive", primitiveKind: "string" };
    const numberType: TypeNode = { kind: "primitive", primitiveKind: "number" };
    const booleanType: TypeNode = { kind: "primitive", primitiveKind: "boolean" };
    const nullType: TypeNode = { kind: "primitive", primitiveKind: "null" };
    const bigintType: TypeNode = { kind: "primitive", primitiveKind: "bigint" };
    const stringOrNumberType: TypeNode = {
      kind: "union",
      members: [stringType, numberType],
    };

    describe("table-driven: (tag text x target type) pairs", () => {
      const cases: readonly {
        readonly description: string;
        readonly text: string;
        readonly targetType: TypeNode | undefined;
        readonly expected: unknown;
      }[] = [
        // AC1: unquoted numeric text is type-directed by the target's kind —
        // a string field must never receive a numeric `default`, and vice versa.
        {
          description: "unquoted 6 on a string field yields the string '6' (AC1)",
          text: "6",
          targetType: stringType,
          expected: "6",
        },
        {
          description: "unquoted 6 on a number field yields the number 6 (AC1)",
          text: "6",
          targetType: numberType,
          expected: 6,
        },
        // AC2: an explicit quoted JSON string is always a string, even when
        // the target type also permits a non-string interpretation.
        {
          description:
            "quoted '6' on a string|number union yields the explicit string '6', not the number 6 (AC2)",
          text: '"6"',
          targetType: stringOrNumberType,
          expected: "6",
        },
        // The complement of AC2: for the same union, an *unquoted* 6 coerces
        // to the permitted non-string member first (spec's "coerce first" rule).
        {
          description: "unquoted 6 on a string|number union coerces to the number 6",
          text: "6",
          targetType: stringOrNumberType,
          expected: 6,
        },
        // AC3: boolean literal is type-directed the same way as numbers.
        {
          description: "unquoted true on a boolean field yields the boolean true (AC3)",
          text: "true",
          targetType: booleanType,
          expected: true,
        },
        {
          description: "unquoted true on a string field yields the string 'true' (AC3)",
          text: "true",
          targetType: stringType,
          expected: "true",
        },
        // Spec example (002 §3.2): text with no non-string interpretation on
        // a string-permitting target falls back to the raw text as a string.
        {
          description:
            "unquoted pending (not valid JSON) on a string field yields the string 'pending'",
          text: "pending",
          targetType: stringType,
          expected: "pending",
        },
        // `null` is a distinct built-in primitive kind (PrimitiveTypeNode
        // primitiveKind "null"), coerced the same way as number/boolean.
        {
          description: "unquoted null on a null-typed field yields JSON null",
          text: "null",
          targetType: nullType,
          expected: null,
        },
        // `bigint` is also a first-class `PrimitiveTypeNode["primitiveKind"]`
        // (bigint maps to JSON Schema `type: "integer"` in the build
        // generator — see ir-json-schema-generator.test.ts), so it must be
        // type-directed the same way `number`/`integer` are for an in-range
        // literal. Copilot review on PR #613 (issue #517).
        {
          description: "unquoted 6 on a bigint field yields the number 6 (in-range literal)",
          text: "6",
          targetType: bigintType,
          expected: 6,
        },
        // No target type supplied (e.g. callers that don't thread a resolved
        // TypeNode, such as the file-snapshots.ts LSP path): falls back to
        // the pre-#517 untyped parse rather than guessing without type info.
        {
          description: "unquoted 6 with no target type falls back to the untyped legacy parse",
          text: "6",
          targetType: undefined,
          expected: 6,
        },
      ];

      for (const { description, text, targetType, expected } of cases) {
        it(description, () => {
          const result = parseDefaultValueTagValue(text, DV_PROV, targetType);
          expect(result.kind).toBe("value");
          if (result.kind !== "value") return;
          expect(result.annotation).toEqual({
            kind: "annotation",
            annotationKind: "defaultValue",
            value: expected,
            provenance: DV_PROV,
          });
        });
      }
    });

    describe("AC4: no valid interpretation for the target type yields a diagnostic-worthy mismatch, never a silently mismatched default", () => {
      it("unquoted pending on a number field: the word has no numeric interpretation, and a number field does not accept a string fallback", () => {
        const result = parseDefaultValueTagValue("pending", DV_PROV, numberType);
        expect(result.kind).toBe("mismatch");
        if (result.kind !== "mismatch") return;
        expect(result.message).toContain("pending");
        expect(result.message).toContain("number");
      });

      it("unquoted true on a number field: a boolean literal has no numeric interpretation and number does not accept a string fallback", () => {
        const result = parseDefaultValueTagValue("true", DV_PROV, numberType);
        expect(result.kind).toBe("mismatch");
      });

      it("quoted string on a strictly numeric field: an explicit string default against a type that never accepts strings", () => {
        const result = parseDefaultValueTagValue('"6"', DV_PROV, numberType);
        expect(result.kind).toBe("mismatch");
      });

      // bigint coverage (Copilot review on PR #613, issue #517): a bigint
      // field behaves the same as a plain numeric field for the mismatch
      // paths — it never accepts a string fallback either.
      it("quoted string on a bigint field: an explicit string default against a type that never accepts strings", () => {
        const result = parseDefaultValueTagValue('"6"', DV_PROV, bigintType);
        expect(result.kind).toBe("mismatch");
        if (result.kind !== "mismatch") return;
        expect(result.message).toContain("bigint");
      });

      it("unquoted pending on a bigint field: no numeric interpretation, and bigint does not accept a string fallback", () => {
        const result = parseDefaultValueTagValue("pending", DV_PROV, bigintType);
        expect(result.kind).toBe("mismatch");
        if (result.kind !== "mismatch") return;
        expect(result.message).toContain("pending");
        expect(result.message).toContain("bigint");
      });

      // Copilot review on PR #613 (issue #517): the mismatch message must not
      // suggest quoting the value as a workaround when the target type does
      // not accept a string at all — that advice would still fail to parse.
      // Both `parseDefaultValueTagValue` call sites only reach the mismatch
      // path when `string` is *not* among the permitted kinds, so pin that
      // "no hint" behavior through the public entry point here...
      it("mismatch message on a number-only field carries no quoting suggestion", () => {
        const result = parseDefaultValueTagValue("pending", DV_PROV, numberType);
        expect(result.kind).toBe("mismatch");
        if (result.kind !== "mismatch") return;
        expect(result.message).not.toContain("quote it explicitly");
      });

      // ...and pin the hint's own formatting contract directly against
      // `_makeDefaultValueMismatch`, since a target type that permits both a
      // non-string kind and `string` can never actually reach the mismatch
      // path (the string fallback always succeeds first) — so this branch is
      // unreachable via `parseDefaultValueTagValue` today but must still stay
      // correct if that invariant ever changes.
      describe("_makeDefaultValueMismatch message-formatting contract", () => {
        it("omits the quoting hint when the target type does not permit string", () => {
          const permittedKinds = new Set<BuiltinPrimitiveKind>(["number"]);
          const result = _makeDefaultValueMismatch("pending", permittedKinds);
          expect(result.message).not.toContain("quote it explicitly");
          expect(result.message).toContain('@defaultValue value "pending"');
        });

        it("includes a correctly-quoted hint when the target type permits string", () => {
          const permittedKinds = new Set<BuiltinPrimitiveKind>(["number", "string"]);
          const result = _makeDefaultValueMismatch("pending", permittedKinds);
          expect(result.message).toContain(
            'quote it explicitly (e.g. @defaultValue "pending") if a string default is intended'
          );
        });

        it("does not double-quote already-quoted raw text in the hint's example", () => {
          // rawText is the raw @defaultValue payload text, which already
          // includes the JSON-string quotes when the author quoted it
          // (e.g. `@defaultValue "6"` -> rawText === `"6"`). The example must
          // use JSON.stringify(rawText), not `"${rawText}"`, or it renders as
          // the doubled `@defaultValue ""6""`.
          const permittedKinds = new Set<BuiltinPrimitiveKind>(["boolean", "string"]);
          const result = _makeDefaultValueMismatch('"6"', permittedKinds);
          expect(result.message).toContain('@defaultValue "\\"6\\""');
          expect(result.message).not.toContain('@defaultValue ""6""');
        });
      });
    });

    // Copilot review on PR #613 (issue #517): a >2^53 bigint default is a
    // known limitation, not a new one introduced here. `coerceParsedJsonToNonString`
    // reaches a `bigint`-permitting target the same way it reaches
    // `number`/`integer` — via `JSON.parse` + `Number.isInteger` — and
    // `JSON.parse` produces a JS `number`, which silently rounds any literal
    // beyond `Number.MAX_SAFE_INTEGER` to the nearest representable double.
    // This is the exact defect already tracked in issue #533 for
    // `@minimum`/`@maximum` bigint bounds (`NumericConstraintNode.value` is
    // typed `number`, and `Number(text)` is used with no precision-safe
    // path) — this codebase has no bigint-literal-text-preservation path
    // anywhere yet, for any tag. Fixing that (widening `JsonValue`-shaped
    // default storage to a decimal-string escape hatch, per 005 §2.3) is
    // #533's scope, not #517's surgical `@defaultValue` fix. This test
    // documents *current* behavior for migration safety — it does not
    // assert the value is spec-correct, only that it doesn't silently
    // change without a test noticing.
    describe("known limitation: bigint defaults beyond Number.MAX_SAFE_INTEGER lose precision (tracked in issue #533, not introduced by #517)", () => {
      it("documents that a huge bigint literal default rounds to the nearest double instead of round-tripping exactly", () => {
        const hugeLiteral = "9999999999999999999"; // > 2^53, spec 002 §3.2's own bigint example
        const result = parseDefaultValueTagValue(hugeLiteral, DV_PROV, bigintType);
        expect(result.kind).toBe("value");
        if (result.kind !== "value") return;
        // Number("9999999999999999999") rounds to 10000000000000000000 —
        // the emitted value does NOT equal the literal text's exact integer
        // value. This is the pre-existing, cross-cutting precision gap
        // (issue #533), pinned here so a future fix must update this test.
        const { value } = result.annotation;
        expect(typeof value).toBe("number");
        expect(value).toBe(Number(hugeLiteral));
        if (typeof value === "number") {
          expect(String(value)).not.toBe(hugeLiteral);
        }
      });
    });

    describe("AC5 support: the emitted default's JS runtime type always matches a kind the target type structurally permits", () => {
      it("never returns a value whose typeof mismatches its target primitive kind", () => {
        const pairs: readonly { readonly text: string; readonly targetType: TypeNode }[] = [
          { text: "6", targetType: numberType },
          { text: "true", targetType: booleanType },
          { text: "6", targetType: stringType },
        ];
        const expectedJsKindByPrimitiveKind: Record<string, string> = {
          number: "number",
          boolean: "boolean",
          string: "string",
        };

        for (const { text, targetType } of pairs) {
          const result = parseDefaultValueTagValue(text, DV_PROV, targetType);
          expect(result.kind).toBe("value");
          if (result.kind !== "value") continue;
          if (targetType.kind !== "primitive") continue;
          expect(typeof result.annotation.value).toBe(
            expectedJsKindByPrimitiveKind[targetType.primitiveKind]
          );
        }
      });
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
