/**
 * Regression tests for issue #367: type-level TSDoc annotations (like `@format
 * monetary-amount`) are not inherited when one interface extends another.
 *
 * The bug: when a derived interface extends a base interface that has type-level
 * annotation tags (e.g. `@format`), the derived type's `$defs` entry loses those
 * annotations. They should be inherited, with derived annotations taking precedence
 * over base annotations for the same annotationKind.
 *
 * @see https://github.com/mike-north/formspec/issues/367
 * @see https://json-schema.org/draft/2020-12/json-schema-core — $defs and $ref semantics
 */

import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { generateSchemas, type GenerateSchemasOptions } from "../generators/class-schema.js";

const fixturesDir = path.join(__dirname, "fixtures");
const fixturePath = path.join(
  fixturesDir,
  "issue-367-interface-heritage-annotations.ts"
);

function generateSchemasOrThrow(options: Omit<GenerateSchemasOptions, "errorReporting">) {
  return generateSchemas({ ...options, errorReporting: "throw" });
}

/** Asserts that `value` is a plain object and returns it typed as `Record<string, unknown>`. */
function expectRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${context}: expected object, got ${typeof value}`);
  }
  return value as Record<string, unknown>;
}

/**
 * Retrieves the resolved `$defs` entry for `name`, listing available keys on failure.
 */
function getDefsEntry(schema: Record<string, unknown>, name: string): Record<string, unknown> {
  const defs = expectRecord(schema.$defs ?? {}, "$defs");
  const entry = defs[name];
  if (entry === undefined) {
    const keys = Object.keys(defs);
    throw new Error(
      `$defs entry "${name}" not found. Available entries: [${keys.join(", ")}]`
    );
  }
  return expectRecord(entry, `$defs.${name}`);
}

// =============================================================================
// #367 base case: single-level extends — @format inherited from base
// =============================================================================

describe("interface heritage annotation inheritance — single-level extends (#367)", () => {
  it("derived interface inherits @format from base interface", () => {
    // spec: PositiveMonetaryAmount extends MonetaryAmount which has @format monetary-amount.
    // The derived type's $defs entry must carry format: "monetary-amount" even though
    // @format is declared only on the base interface.
    const result = generateSchemasOrThrow({
      filePath: fixturePath,
      typeName: "MinAmountConfig",
    });

    const schema = result.jsonSchema as Record<string, unknown>;
    const positiveMonetaryAmount = getDefsEntry(schema, "PositiveMonetaryAmount");

    // PositiveMonetaryAmount must inherit @format from MonetaryAmount (fix for #367)
    expect(positiveMonetaryAmount).toHaveProperty("format", "monetary-amount");
  });

  it("derived interface $defs entry is an object type with expected properties", () => {
    const result = generateSchemasOrThrow({
      filePath: fixturePath,
      typeName: "MinAmountConfig",
    });

    const schema = result.jsonSchema as Record<string, unknown>;
    const positiveMonetaryAmount = getDefsEntry(schema, "PositiveMonetaryAmount");

    // Structural assertions: the type should still be an object with properties
    expect(positiveMonetaryAmount).toHaveProperty("type", "object");
    expect(positiveMonetaryAmount).toHaveProperty("properties");
  });
});

// =============================================================================
// Multi-level inheritance: A → B → C
// =============================================================================

describe("interface heritage annotation inheritance — multi-level extends (#367)", () => {
  it("deeply-derived interface inherits @format from grandparent interface", () => {
    // spec: ConstrainedAmount extends MidAmount extends BaseAmount.
    // BaseAmount has @format monetary-amount.
    // ConstrainedAmount must carry format: "monetary-amount" through the full chain.
    const result = generateSchemasOrThrow({
      filePath: fixturePath,
      typeName: "MultiLevelConfig",
    });

    const schema = result.jsonSchema as Record<string, unknown>;
    const constrainedAmount = getDefsEntry(schema, "ConstrainedAmount");

    expect(constrainedAmount).toHaveProperty("format", "monetary-amount");
  });
});

// =============================================================================
// Multiple extends: interface X extends A, B
// =============================================================================

describe("interface heritage annotation inheritance — multiple extends (#367)", () => {
  it("inherits @format from one base and @displayName (→ title) from another base", () => {
    // spec: MultiBaseAmount extends WithFormat (@format monetary-amount)
    //                           and WithDisplayName (@displayName Payment amount).
    // Both annotations should appear on the derived type.
    const result = generateSchemasOrThrow({
      filePath: fixturePath,
      typeName: "MultiExtendsConfig",
    });

    const schema = result.jsonSchema as Record<string, unknown>;
    const multiBaseAmount = getDefsEntry(schema, "MultiBaseAmount");

    // @format from WithFormat — emitted as JSON Schema "format"
    expect(multiBaseAmount).toHaveProperty("format", "monetary-amount");
    // @displayName from WithDisplayName — emitted as JSON Schema "title"
    expect(multiBaseAmount).toHaveProperty("title", "Payment amount");
  });
});

// =============================================================================
// Derived overrides base: derived @format wins over base @format
// =============================================================================

describe("interface heritage annotation inheritance — derived annotation overrides base (#367)", () => {
  it("derived @format takes precedence over base @format for the same annotationKind", () => {
    // spec: SpecificAmount extends GenericAmount (@format monetary-amount).
    // SpecificAmount has @format positive-monetary-amount — derived wins.
    const result = generateSchemasOrThrow({
      filePath: fixturePath,
      typeName: "OverrideConfig",
    });

    const schema = result.jsonSchema as Record<string, unknown>;
    const specificAmount = getDefsEntry(schema, "SpecificAmount");

    // Derived annotation wins — "positive-monetary-amount", not "monetary-amount"
    expect(specificAmount).toHaveProperty("format", "positive-monetary-amount");
  });
});

// =============================================================================
// Negative case: no base annotations — derived type carries only its own
// =============================================================================

describe("interface heritage annotation inheritance — no regression when base has no annotations (#367)", () => {
  it("derived type with annotations and a plain base still carries its own annotations", () => {
    // spec: PlainDerived extends PlainBase (no type-level annotations).
    // PlainDerived has @format widget — this should not be affected by base inheritance.
    const result = generateSchemasOrThrow({
      filePath: fixturePath,
      typeName: "PlainConfig",
    });

    const schema = result.jsonSchema as Record<string, unknown>;
    const plainDerived = getDefsEntry(schema, "PlainDerived");

    // Own @format annotation is preserved
    expect(plainDerived).toHaveProperty("format", "widget");
  });

  it("a plain base type with no type-level annotations produces no format in its $defs entry", () => {
    // Verify that the inheritance machinery doesn't accidentally add annotations
    // to a base type that has none.
    const result = generateSchemasOrThrow({
      filePath: fixturePath,
      typeName: "PlainConfig",
    });

    const schema = result.jsonSchema as Record<string, unknown>;
    const defs = expectRecord(schema.$defs ?? {}, "$defs");

    // PlainBase may not appear in $defs if not directly referenced — that's fine.
    // If it does appear, it must not have a "format" property.
    const plainBaseEntry = defs["PlainBase"];
    if (plainBaseEntry !== undefined) {
      const plainBase = expectRecord(plainBaseEntry, "$defs.PlainBase");
      expect(plainBase).not.toHaveProperty("format");
    }
  });
});
