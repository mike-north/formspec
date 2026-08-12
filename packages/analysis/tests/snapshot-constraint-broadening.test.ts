/**
 * Regression tests for issue #396.
 *
 * The snapshot consumer (`buildFormSpecAnalysisFileSnapshot`, used by the
 * language server / ts-plugin) called `parseConstraintTagValue` without a
 * `fieldType` or `pathResolvedCustomTypeId`, so builtin constraint tags on
 * registered custom types never broadened into their type-specific
 * `CustomConstraintNode` — downstream IDE tooling saw a generic
 * `NumericConstraintNode` / `LengthConstraintNode` instead (e.g. a plain
 * `{ minimum: 10 }` rather than `DecimalMinimum`). The build consumer already
 * applied this broadening for direct fields, and gained path-targeted
 * broadening in issue #395 / PR #398 — this file pins parity for the
 * snapshot consumer.
 *
 * Each test asserts `declarationSummary.facts` contains a `custom-constraint`
 * fact (not the pre-fix generic `numeric-constraints` / `string-constraints`
 * fact) for the scenarios called out in the issue's acceptance criteria.
 *
 * @see https://github.com/mike-north/formspec/issues/396
 * @see https://github.com/mike-north/formspec/issues/395
 */

import { describe, expect, it } from "vitest";
import { defineConstraint, defineCustomType, defineExtension } from "@formspec/core";
import type { ExtensionDefinition } from "@formspec/core";
import { buildFormSpecAnalysisFileSnapshot } from "../src/internal.js";
import type { FormSpecAnalysisFileSnapshot } from "../src/semantic-protocol.js";
import type { FormSpecSerializedDeclarationFact } from "../src/internal.js";
import { createProgram } from "./helpers.js";

// =============================================================================
// Shared fixture extensions
// =============================================================================

const DECIMAL_EXTENSION_ID = "x-test/broadening-396-decimal";
const POSTAL_EXTENSION_ID = "x-test/broadening-396-postal";
const DECIMAL_BRAND_EXTENSION_ID = "x-test/broadening-396-decimal-brand";

/** Numeric, name-registered custom type broadening `@minimum`. */
const decimalExtension: ExtensionDefinition = defineExtension({
  extensionId: DECIMAL_EXTENSION_ID,
  types: [
    defineCustomType({
      typeName: "Decimal",
      tsTypeNames: ["Decimal"],
      builtinConstraintBroadenings: [
        { tagName: "minimum", constraintName: "DecimalMinimum", parseValue: (raw) => raw.trim() },
      ],
      toJsonSchema: () => ({ type: "string", format: "decimal" }),
    }),
  ],
  constraints: [
    defineConstraint({
      constraintName: "DecimalMinimum",
      compositionRule: "intersect",
      applicableTypes: ["custom"],
      toJsonSchema: (payload) => ({ decimalMinimum: payload }),
    }),
  ],
});

/** String-backed, name-registered custom type broadening `@pattern`. */
const postalCodeExtension: ExtensionDefinition = defineExtension({
  extensionId: POSTAL_EXTENSION_ID,
  types: [
    defineCustomType({
      typeName: "PostalCode",
      tsTypeNames: ["PostalCode"],
      builtinConstraintBroadenings: [
        {
          tagName: "pattern",
          constraintName: "PostalCodePattern",
          parseValue: (raw) => raw.trim(),
        },
      ],
      toJsonSchema: () => ({ type: "string" }),
    }),
  ],
  constraints: [
    defineConstraint({
      constraintName: "PostalCodePattern",
      compositionRule: "intersect",
      applicableTypes: ["custom"],
      toJsonSchema: (payload) => ({ postalCodePattern: payload }),
    }),
  ],
});

/**
 * Numeric custom type registered ONLY via `brand` (no `tsTypeNames`) —
 * `brand` is the currently-recommended, non-deprecated registration
 * mechanism (`tsTypeNames` is `@deprecated` on `CustomTypeRegistration`).
 * Mirrors the build consumer's brand-based resolution strategy in
 * `resolveCustomTypeFromTsType` (`packages/build/src/extensions/resolve-custom-type.ts`).
 */
const decimalBrandExtension: ExtensionDefinition = defineExtension({
  extensionId: DECIMAL_BRAND_EXTENSION_ID,
  types: [
    defineCustomType({
      typeName: "DecimalBranded",
      brand: "__decimalBrandOnly",
      builtinConstraintBroadenings: [
        {
          tagName: "minimum",
          constraintName: "DecimalBrandedMinimum",
          parseValue: (raw) => raw.trim(),
        },
      ],
      toJsonSchema: () => ({ type: "string", format: "decimal" }),
    }),
  ],
  constraints: [
    defineConstraint({
      constraintName: "DecimalBrandedMinimum",
      compositionRule: "intersect",
      applicableTypes: ["custom"],
      toJsonSchema: (payload) => ({ decimalBrandedMinimum: payload }),
    }),
  ],
});
const decimalVectorExtension: ExtensionDefinition = defineExtension({
  extensionId: "x-test/broadening-396-vector",
  types: [
    defineCustomType({
      typeName: "DecimalVector",
      tsTypeNames: ["DecimalVector"],
      builtinConstraintBroadenings: [
        {
          tagName: "minimum",
          constraintName: "DecimalVectorMinimum",
          parseValue: (raw) => raw.trim(),
        },
      ],
      toJsonSchema: () => ({ type: "array", items: { type: "string" } }),
    }),
  ],
  constraints: [
    defineConstraint({
      constraintName: "DecimalVectorMinimum",
      compositionRule: "intersect",
      applicableTypes: ["custom"],
      toJsonSchema: (payload) => ({ decimalVectorMinimum: payload }),
    }),
  ],
});
const opaqueDecimalVectorExtension: ExtensionDefinition = defineExtension({
  extensionId: "x-test/broadening-396-opaque-vector",
  types: [
    defineCustomType({
      typeName: "DecimalVector",
      tsTypeNames: ["DecimalVector"],
      toJsonSchema: () => ({ type: "array", items: { type: "string" } }),
    }),
  ],
});
const alternateDecimalExtension: ExtensionDefinition = defineExtension({
  extensionId: "x-test/broadening-396-alternate-decimal",
  types: [
    defineCustomType({
      typeName: "AlternateDecimal",
      tsTypeNames: ["Decimal"],
      builtinConstraintBroadenings: [
        {
          tagName: "minimum",
          constraintName: "AlternateDecimalMinimum",
          parseValue: (raw) => raw.trim(),
        },
      ],
      toJsonSchema: () => ({ type: "string", format: "alternate-decimal" }),
    }),
  ],
  constraints: [
    defineConstraint({
      constraintName: "AlternateDecimalMinimum",
      compositionRule: "intersect",
      applicableTypes: ["custom"],
      toJsonSchema: (payload) => ({ alternateDecimalMinimum: payload }),
    }),
  ],
});

// =============================================================================
// Helper: build a snapshot over a single-declaration source and return the
// (only) declaration's facts.
// =============================================================================

function buildFacts(
  source: string,
  extensions: readonly ExtensionDefinition[],
  fileName: string
): readonly FormSpecSerializedDeclarationFact[] {
  const { checker, sourceFile } = createProgram(source, fileName);
  const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, {
    checker,
    extensionDefinitions: extensions,
  });
  const [comment] = snapshot.comments;
  expect(comment, "Expected exactly one doc-commented declaration in the fixture").toBeDefined();
  return comment?.declarationSummary.facts ?? [];
}

function findCustomConstraintFact(
  facts: readonly FormSpecSerializedDeclarationFact[]
): Extract<FormSpecSerializedDeclarationFact, { kind: "custom-constraint" }> | undefined {
  return facts.find(
    (fact): fact is Extract<FormSpecSerializedDeclarationFact, { kind: "custom-constraint" }> =>
      fact.kind === "custom-constraint"
  );
}
function buildSnapshot(
  source: string,
  extensions: readonly ExtensionDefinition[],
  fileName: string
): FormSpecAnalysisFileSnapshot {
  const { checker, sourceFile } = createProgram(source, fileName);
  return buildFormSpecAnalysisFileSnapshot(sourceFile, {
    checker,
    extensionDefinitions: extensions,
  });
}

describe("snapshot consumer constraint broadening (issue #396)", () => {
  it("broadens a direct @minimum on a registered Decimal field into DecimalMinimum", () => {
    const source = [
      "type Decimal = string & { readonly __decimalBrand: true };",
      "class Foo {",
      "  /** @minimum 10 */",
      "  amount!: Decimal;",
      "}",
    ].join("\n");

    const facts = buildFacts(source, [decimalExtension], "/virtual/broadening-direct.ts");

    // Pre-fix behavior: a generic `numeric-constraints` fact with `minimum: 10`.
    expect(facts.some((fact) => fact.kind === "numeric-constraints")).toBe(false);

    const customFact = findCustomConstraintFact(facts);
    expect(customFact).toBeDefined();
    expect(customFact?.targetPath).toBeNull();
    expect(customFact?.constraintId).toBe(`${DECIMAL_EXTENSION_ID}/DecimalMinimum`);
    expect(customFact?.payload).toBe("10");
  });

  it("uses the first broadening when multiple registrations match the same TS type", () => {
    const source = [
      "type Decimal = string & { readonly __decimalBrand: true };",
      "class Foo {",
      "  /** @minimum 10 */",
      "  amount!: Decimal;",
      "}",
    ].join("\n");
    const snapshot = buildSnapshot(
      source,
      [decimalExtension, alternateDecimalExtension],
      "/virtual/broadening-duplicate-registration.ts"
    );

    expect(
      snapshot.diagnostics.filter((diagnostic) => diagnostic.code === "TYPE_MISMATCH")
    ).toEqual([]);
    const facts = snapshot.comments[0]?.declarationSummary.facts ?? [];
    expect(findCustomConstraintFact(facts)).toMatchObject({
      constraintId: `${DECIMAL_EXTENSION_ID}/DecimalMinimum`,
      payload: "10",
    });
  });

  it("broadens @minimum on direct and path-targeted Decimal array items", () => {
    const directFacts = buildFacts(
      [
        "type Decimal = string & { readonly __decimalBrand: true };",
        "class Foo {",
        "  /** @minimum 10 */",
        "  amounts!: Decimal[];",
        "}",
      ].join("\n"),
      [decimalExtension],
      "/virtual/broadening-direct-array.ts"
    );
    const directCustomFact = findCustomConstraintFact(directFacts);
    expect(directFacts.some((fact) => fact.kind === "numeric-constraints")).toBe(false);
    expect(directCustomFact?.targetPath).toBeNull();
    expect(directCustomFact?.constraintId).toBe(`${DECIMAL_EXTENSION_ID}/DecimalMinimum`);
    expect(directCustomFact?.payload).toBe("10");

    const pathFacts = buildFacts(
      [
        "type Decimal = string & { readonly __decimalBrand: true };",
        "type Ledger = { amounts: Decimal[] };",
        "class Foo {",
        "  /** @minimum :amounts 10 */",
        "  ledger!: Ledger;",
        "}",
      ].join("\n"),
      [decimalExtension],
      "/virtual/broadening-path-array.ts"
    );
    const pathCustomFact = findCustomConstraintFact(pathFacts);
    expect(pathFacts.some((fact) => fact.kind === "numeric-constraints")).toBe(false);
    expect(pathCustomFact?.targetPath).toBe("amounts");
    expect(pathCustomFact?.constraintId).toBe(`${DECIMAL_EXTENSION_ID}/DecimalMinimum`);
    expect(pathCustomFact?.payload).toBe("10");
  });

  it("broadens a path-targeted @minimum on a MonetaryAmount field into DecimalMinimum with the path preserved", () => {
    const source = [
      "type Decimal = string & { readonly __decimalBrand: true };",
      "type MonetaryAmount = { amount: Decimal };",
      "class Foo {",
      "  /** @minimum :amount 10 */",
      "  money!: MonetaryAmount;",
      "}",
    ].join("\n");

    const facts = buildFacts(source, [decimalExtension], "/virtual/broadening-path.ts");

    expect(facts.some((fact) => fact.kind === "numeric-constraints")).toBe(false);

    const customFact = findCustomConstraintFact(facts);
    expect(customFact).toBeDefined();
    expect(customFact?.targetPath).toBe("amount");
    expect(customFact?.constraintId).toBe(`${DECIMAL_EXTENSION_ID}/DecimalMinimum`);
    expect(customFact?.payload).toBe("10");
  });

  it("broadens a direct @minimum on a nullable Decimal field (Decimal | null)", () => {
    const source = [
      "type Decimal = string & { readonly __decimalBrand: true };",
      "class Foo {",
      "  /** @minimum 3 */",
      "  amount!: Decimal | null;",
      "}",
    ].join("\n");

    const facts = buildFacts(source, [decimalExtension], "/virtual/broadening-nullable-direct.ts");

    expect(facts.some((fact) => fact.kind === "numeric-constraints")).toBe(false);

    const customFact = findCustomConstraintFact(facts);
    expect(customFact).toBeDefined();
    expect(customFact?.targetPath).toBeNull();
    expect(customFact?.constraintId).toBe(`${DECIMAL_EXTENSION_ID}/DecimalMinimum`);
    expect(customFact?.payload).toBe("3");
  });

  it("broadens a path-targeted @minimum through a nullable custom type at the terminal segment", () => {
    const source = [
      "type Decimal = string & { readonly __decimalBrand: true };",
      "type MonetaryAmount = { amount: Decimal | null };",
      "class Foo {",
      "  /** @minimum :amount 7 */",
      "  money!: MonetaryAmount;",
      "}",
    ].join("\n");

    const facts = buildFacts(source, [decimalExtension], "/virtual/broadening-nullable-path.ts");

    expect(facts.some((fact) => fact.kind === "numeric-constraints")).toBe(false);

    const customFact = findCustomConstraintFact(facts);
    expect(customFact).toBeDefined();
    expect(customFact?.targetPath).toBe("amount");
    expect(customFact?.constraintId).toBe(`${DECIMAL_EXTENSION_ID}/DecimalMinimum`);
    expect(customFact?.payload).toBe("7");
  });
  it("does not broaden an unresolvable path from the broadened host type", () => {
    const source = [
      "type Decimal = string & { readonly __decimalBrand: true };",
      "class Foo {",
      "  /** @minimum :missing 10 */",
      "  amount!: Decimal;",
      "}",
    ].join("\n");

    const snapshot = buildSnapshot(
      source,
      [decimalExtension],
      "/virtual/broadening-missing-path.ts"
    );
    expect(snapshot.diagnostics.some((diagnostic) => diagnostic.code === "TYPE_MISMATCH")).toBe(
      true
    );
    expect(
      snapshot.comments[0]?.declarationSummary.facts.some(
        (fact) => fact.kind === "custom-constraint"
      )
    ).toBe(false);
  });

  it("broadens a deeply nested path (4 segments) down to a Decimal terminal", () => {
    const source = [
      "type Decimal = string & { readonly __decimalBrand: true };",
      "type Level1 = { amount: Decimal };",
      "type Level2 = { level1: Level1 };",
      "type Level3 = { level2: Level2 };",
      "type Level4 = { level3: Level3 };",
      "class Foo {",
      "  /** @minimum :level3.level2.level1.amount 9 */",
      "  root!: Level4;",
      "}",
    ].join("\n");

    const facts = buildFacts(source, [decimalExtension], "/virtual/broadening-deep-path.ts");

    expect(facts.some((fact) => fact.kind === "numeric-constraints")).toBe(false);

    const customFact = findCustomConstraintFact(facts);
    expect(customFact).toBeDefined();
    expect(customFact?.targetPath).toBe("level3.level2.level1.amount");
    expect(customFact?.constraintId).toBe(`${DECIMAL_EXTENSION_ID}/DecimalMinimum`);
    expect(customFact?.payload).toBe("9");
  });

  it("broadens a direct @pattern on a string-backed custom type (PostalCode) into PostalCodePattern", () => {
    const source = [
      "type PostalCode = string & { readonly __postalBrand: true };",
      "class Foo {",
      "  /** @pattern ^[0-9]{5}$ */",
      "  zip!: PostalCode;",
      "}",
    ].join("\n");

    const facts = buildFacts(source, [postalCodeExtension], "/virtual/broadening-string-backed.ts");

    // Pre-fix behavior: a generic `string-constraints` fact with `patterns: [...]`.
    expect(facts.some((fact) => fact.kind === "string-constraints")).toBe(false);

    const customFact = findCustomConstraintFact(facts);
    expect(customFact).toBeDefined();
    expect(customFact?.targetPath).toBeNull();
    expect(customFact?.constraintId).toBe(`${POSTAL_EXTENSION_ID}/PostalCodePattern`);
    expect(customFact?.payload).toBe("^[0-9]{5}$");
  });

  it("broadens a direct @minimum on a custom type registered ONLY via brand (no tsTypeNames)", () => {
    // `brand` is the currently-recommended registration mechanism
    // (`tsTypeNames` is `@deprecated`); this pins that the snapshot consumer
    // does not silently fall back to un-broadened output for extensions
    // that follow that recommendation.
    const source = [
      "declare const __decimalBrandOnly: unique symbol;",
      "type Decimal = string & { readonly [__decimalBrandOnly]: true };",
      "class Foo {",
      "  /** @minimum 10 */",
      "  amount!: Decimal;",
      "}",
    ].join("\n");

    const facts = buildFacts(source, [decimalBrandExtension], "/virtual/broadening-brand.ts");

    expect(facts.some((fact) => fact.kind === "numeric-constraints")).toBe(false);

    const customFact = findCustomConstraintFact(facts);
    expect(customFact).toBeDefined();
    expect(customFact?.targetPath).toBeNull();
    expect(customFact?.constraintId).toBe(`${DECIMAL_BRAND_EXTENSION_ID}/DecimalBrandedMinimum`);
    expect(customFact?.payload).toBe("10");
  });

  it("emits no TYPE_MISMATCH diagnostic for a brand-only registration (#396 review finding)", () => {
    // Regression: hasExtensionBroadening (the capability-check gate) matched
    // by name only while resolveExtensionCustomTypeId matched name + brand,
    // so a brand-only registration produced a correctly broadened fact AND a
    // spurious TYPE_MISMATCH error on the same valid tag — a red squiggle on
    // exactly the registration mechanism the docs recommend.
    const source = [
      "declare const __decimalBrandOnly: unique symbol;",
      "type Decimal = string & { readonly [__decimalBrandOnly]: true };",
      "class Foo {",
      "  /** @minimum 10 */",
      "  amount!: Decimal;",
      "}",
    ].join("\n");

    const { checker, sourceFile } = createProgram(source, "/virtual/broadening-brand-diag.ts");
    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, {
      checker,
      extensionDefinitions: [decimalBrandExtension],
    });

    expect(snapshot.diagnostics.filter((d) => d.code === "TYPE_MISMATCH")).toEqual([]);
    const [comment] = snapshot.comments;
    expect(
      comment?.declarationSummary.facts.some((fact) => fact.kind === "custom-constraint")
    ).toBe(true);
  });

  it("does not broaden when the field type is not a registered custom type", () => {
    const source = ["class Foo {", "  /** @minimum 10 */", "  amount!: number;", "}"].join("\n");

    const facts = buildFacts(source, [decimalExtension], "/virtual/broadening-unregistered.ts");

    // No matching custom type registered for a plain `number` field — the
    // constraint stays a generic numeric-constraints fact.
    expect(findCustomConstraintFact(facts)).toBeUndefined();
    expect(facts).toEqual([
      {
        kind: "numeric-constraints",
        targetPath: null,
        minimum: 10,
      },
    ]);
  });
  it("has no contradictory diagnostic for a path-targeted Decimal[] fact", () => {
    const source = [
      "type Decimal = string & { readonly __decimalBrand: true };",
      "type Ledger = { amounts: Decimal[] };",
      "class Foo {",
      "  /** @minimum :amounts 10 */",
      "  ledger!: Ledger;",
      "}",
    ].join("\n");
    const { checker, sourceFile } = createProgram(source, "/virtual/path-array-diag.ts");
    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, {
      checker,
      extensionDefinitions: [decimalExtension],
    });
    expect(snapshot.diagnostics.filter((d) => d.code === "TYPE_MISMATCH")).toEqual([]);
    expect(snapshot.comments[0]?.declarationSummary.facts).toContainEqual(
      expect.objectContaining({
        kind: "custom-constraint",
        targetPath: "amounts",
        constraintId: `${DECIMAL_EXTENSION_ID}/DecimalMinimum`,
        payload: "10",
      })
    );
  });

  it("uses a registered DecimalVector container broadening on a path terminal", () => {
    const source = [
      "type DecimalVector = string[];",
      "type Ledger = { amounts: DecimalVector };",
      "class Foo {",
      "  /** @minimum :amounts 10 */",
      "  ledger!: Ledger;",
      "}",
    ].join("\n");
    const facts = buildFacts(source, [decimalVectorExtension], "/virtual/vector-path.ts");
    expect(findCustomConstraintFact(facts)).toMatchObject({
      targetPath: "amounts",
      constraintId: "x-test/broadening-396-vector/DecimalVectorMinimum",
      payload: "10",
    });
  });

  it("does not fall back to item broadening through a registered path terminal", () => {
    const source = [
      "type Decimal = string & { readonly __decimalBrand: true };",
      "type DecimalVector = Decimal[];",
      "type Ledger = { amounts: DecimalVector };",
      "class Foo {",
      "  /** @minimum :amounts 10 */",
      "  ledger!: Ledger;",
      "}",
    ].join("\n");
    const snapshot = buildSnapshot(
      source,
      [decimalExtension, opaqueDecimalVectorExtension],
      "/virtual/opaque-vector-path.ts"
    );

    expect(snapshot.diagnostics).toContainEqual(expect.objectContaining({ code: "TYPE_MISMATCH" }));
    const facts = snapshot.comments[0]?.declarationSummary.facts ?? [];
    expect(findCustomConstraintFact(facts)).toBeUndefined();
  });
});
