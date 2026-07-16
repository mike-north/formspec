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
import type { FormSpecSerializedDeclarationFact } from "../src/internal.js";
import { createProgram } from "./helpers.js";

// =============================================================================
// Shared fixture extensions
// =============================================================================

const DECIMAL_EXTENSION_ID = "x-test/broadening-396-decimal";
const POSTAL_EXTENSION_ID = "x-test/broadening-396-postal";

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

  it("does not broaden when the field type is not a registered custom type", () => {
    const source = [
      "class Foo {",
      "  /** @minimum 10 */",
      "  amount!: number;",
      "}",
    ].join("\n");

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
});
