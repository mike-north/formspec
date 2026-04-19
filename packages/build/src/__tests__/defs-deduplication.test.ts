/**
 * Regression tests for issue #309: named string-union enum types used as
 * optional properties are not placed in `$defs` / referenced via `$ref`.
 *
 * Root cause: TypeScript's type checker produces `Currency | undefined` for
 * an optional property `currency?: Currency`. This synthesized union loses the
 * `aliasSymbol` from the original `Currency` alias, so the class-analyzer
 * never looks up the alias declaration and never registers `Currency` in the
 * `typeRegistry`. The result is that `Currency` is inlined at every usage site
 * rather than deduplicated into `$defs`, ballooning the schema size.
 *
 * For large enums (e.g., 157 ISO 4217 currency codes) used across multiple
 * fields this can exceed server-side string length limits (e.g., 5000 chars).
 *
 * @see https://github.com/mike-north/formspec/issues/309
 * @see https://json-schema.org/draft/2020-12/json-schema-core — $defs and $ref semantics
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSchemas, type GenerateSchemasOptions } from "../generators/class-schema.js";

function generateSchemasOrThrow(options: Omit<GenerateSchemasOptions, "errorReporting">) {
  return generateSchemas({ ...options, errorReporting: "throw" });
}

/** Asserts that `value` is a plain object and returns it typed as `Record<string, unknown>`. */
function expectRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${message}: expected object, got ${typeof value}`);
  }
  return value as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

/**
 * 20-member string union used as both required and optional properties.
 * - `required` usage: `currency: Currency` (required field)
 * - `optional` usage: `currency?: Currency` (optional field)
 *
 * The bug: when `currency?: Currency` is optional, TypeScript synthesizes
 * `Currency | undefined`. The synthesized union loses `aliasSymbol`, so the
 * class-analyzer never registers `Currency` in the typeRegistry, causing
 * the enum to be inlined instead of referenced via `$ref`.
 */
const FIXTURE_SOURCE = [
  "type Currency =",
  '  | "AED" | "AFN" | "ALL" | "AMD" | "ANG"',
  '  | "AOA" | "ARS" | "AUD" | "AWG" | "AZN"',
  '  | "BAM" | "BBD" | "BDT" | "BGN" | "BHD"',
  '  | "BIF" | "BMD" | "BND" | "BOB" | "BRL";',
  "",
  "// Required currency field — $defs deduplication should work",
  "interface MonetaryAmount {",
  "  amount: number;",
  "  currency: Currency;",
  "}",
  "",
  "// Optional currency field — THIS triggers the bug",
  "interface OptionalMonetaryAmount {",
  "  amount: number;",
  "  currency?: Currency;",
  "}",
  "",
  "export class RequiredCurrencyConfig {",
  "  subtotal!: MonetaryAmount;",
  "  total!: MonetaryAmount;",
  "  tax!: MonetaryAmount;",
  "}",
  "",
  "export class OptionalCurrencyConfig {",
  "  subtotal!: OptionalMonetaryAmount;",
  "  total!: OptionalMonetaryAmount;",
  "  tax!: OptionalMonetaryAmount;",
  "}",
  "",
  "// Optional currency used directly on a class (not nested in an interface)",
  "export class DirectOptionalCurrencyConfig {",
  "  curr1?: Currency;",
  "  curr2?: Currency;",
  "  curr3?: Currency;",
  "}",
].join("\n");

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let fixturePath: string;
let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-defs-dedup-"));

  fs.writeFileSync(
    path.join(tmpDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "nodenext",
          strict: true,
          skipLibCheck: true,
        },
      },
      null,
      2
    )
  );

  fixturePath = path.join(tmpDir, "fixture.ts");
  fs.writeFileSync(fixturePath, FIXTURE_SOURCE);
});

afterAll(() => {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// Tests — issue #309 regression
// ---------------------------------------------------------------------------

describe("$defs deduplication — issue #309", () => {
  // -------------------------------------------------------------------------
  // Baseline: required fields work correctly (these were NOT broken)
  // -------------------------------------------------------------------------
  describe("required enum field (baseline — was not broken)", () => {
    it("places Currency in $defs for a required currency field", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "RequiredCurrencyConfig",
      });

      // Required fields correctly deduplicate Currency into $defs.
      // This is the baseline — verifying the non-broken path continues to work.
      const defs = result.jsonSchema.$defs ?? {};
      expect(Object.keys(defs), "Expected Currency in $defs for required field").toContain(
        "Currency"
      );
    });

    it("uses $ref for Currency inside MonetaryAmount when field is required", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "RequiredCurrencyConfig",
      });

      const defs = result.jsonSchema.$defs ?? {};
      const monetary = defs["MonetaryAmount"] as Record<string, unknown>;
      expect(monetary, "Expected $defs.MonetaryAmount to exist").toBeDefined();

      const props = monetary["properties"] as Record<string, Record<string, unknown>>;
      // spec: JSON Schema 2020-12 §10.2.1 — named aliases go in $defs, referenced via $ref
      expect(props["currency"]?.["$ref"]).toBe("#/$defs/Currency");
    });
  });

  // -------------------------------------------------------------------------
  // Bug: optional fields inline the enum instead of referencing $defs
  // -------------------------------------------------------------------------
  describe("optional enum field nested in an interface (bug)", () => {
    it("places Currency in $defs even when the property is optional (currency?: Currency)", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "OptionalCurrencyConfig",
      });

      // Bug: TypeScript synthesizes `Currency | undefined` for optional properties.
      // The synthesized union loses aliasSymbol, so the class-analyzer fails to
      // register Currency in the typeRegistry, causing it to be inlined.
      // Fix: resolve the original alias name from the source-node's type annotation.
      const defs = result.jsonSchema.$defs ?? {};
      expect(
        Object.keys(defs),
        "Expected Currency in $defs even when currency?: Currency is optional. " +
          "The bug inlines the enum instead."
      ).toContain("Currency");
    });

    it("uses $ref for Currency inside OptionalMonetaryAmount.$defs entry", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "OptionalCurrencyConfig",
      });

      // When fixed, OptionalMonetaryAmount.$defs should $ref Currency,
      // not embed the full enum inline.
      // spec: class-analyzer §resolveUnionType — named alias recovered from source node
      const defs = result.jsonSchema.$defs ?? {};
      const monetary = defs["OptionalMonetaryAmount"] as Record<string, unknown>;
      expect(monetary, "Expected $defs.OptionalMonetaryAmount to exist").toBeDefined();

      const props = expectRecord(
        monetary["properties"],
        "Expected $defs.OptionalMonetaryAmount.properties to exist"
      );
      const currencyProp = expectRecord(
        props["currency"],
        "Expected currency property in OptionalMonetaryAmount"
      );
      expect(currencyProp, "Expected currency property in OptionalMonetaryAmount").toBeDefined();
      expect(
        currencyProp["$ref"],
        "Expected currency to use $ref to Currency (not an inline enum)"
      ).toBe("#/$defs/Currency");
    });

    it("does not inline the enum directly in OptionalMonetaryAmount (no 'enum' key on currency prop)", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "OptionalCurrencyConfig",
      });

      const defs = result.jsonSchema.$defs ?? {};
      // Use defensive accessors so a missing $defs entry produces a clear failure,
      // not a cryptic "cannot read properties of undefined".
      const monetary = defs["OptionalMonetaryAmount"] as Record<string, unknown> | undefined;
      const props = monetary === undefined
        ? undefined
        : monetary["properties"] as Record<string, unknown> | undefined;
      const currencyProp = props === undefined
        ? undefined
        : props["currency"] as Record<string, unknown> | undefined;

      // When the enum is inlined, the currency property has an `enum` key with
      // all 20 values directly on it. After the fix, it should have only a `$ref`.
      expect(
        currencyProp?.["enum"],
        "Currency should NOT be inlined — expected a $ref, not an enum"
      ).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Bug: optional enum field directly on a class (no intermediate interface)
  // -------------------------------------------------------------------------
  describe("optional enum field directly on a class (bug)", () => {
    it("places Currency in $defs when optional currency fields are on the class directly", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "DirectOptionalCurrencyConfig",
      });

      // Same bug: `curr1?: Currency` produces `Currency | undefined` type,
      // losing the aliasSymbol. Currency should still be registered in $defs.
      const defs = result.jsonSchema.$defs ?? {};
      expect(
        Object.keys(defs),
        "Expected Currency in $defs for direct optional field curr1?: Currency"
      ).toContain("Currency");
    });

    it("uses $ref for each optional currency field on the class", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "DirectOptionalCurrencyConfig",
      });

      const props = result.jsonSchema.properties as Record<string, Record<string, unknown>>;
      // Each of curr1, curr2, curr3 should reference Currency via $ref (possibly
      // wrapped in oneOf with null for optional, or a direct $ref for non-strict optional).
      // At minimum, the currency enum must NOT be inlined at each field.
      for (const fieldName of ["curr1", "curr2", "curr3"]) {
        const fieldSchema = expectRecord(props[fieldName], `Expected ${fieldName} to be defined`);
        expect(fieldSchema, `Expected ${fieldName} to be defined`).toBeDefined();

        // The enum values should NOT appear inline in the field schema.
        expect(
          fieldSchema["enum"],
          `Expected ${fieldName} NOT to have an inline enum — should use $ref to Currency`
        ).toBeUndefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Schema size regression guard
  // -------------------------------------------------------------------------
  describe("schema size regression guard", () => {
    it("optional variant schema is not significantly larger than required variant", () => {
      const required = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "RequiredCurrencyConfig",
      });
      const optional = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "OptionalCurrencyConfig",
      });

      const requiredSize = JSON.stringify(required.jsonSchema).length;
      const optionalSize = JSON.stringify(optional.jsonSchema).length;

      // Without the fix, the optional schema inlines the 20-member enum inside
      // OptionalMonetaryAmount's $defs entry, making it noticeably larger than
      // the required schema (which uses $ref). The difference should be small
      // after the fix (only a few chars for the `required` array difference).
      //
      // With 157 ISO 4217 codes, inlining causes the schema to balloon past the
      // 5000-char server-side limit. For 20 codes, the difference is smaller but
      // still measurable and scales linearly with enum size.
      //
      // spec: class-analyzer §resolveUnionType — both cases should use $defs
      expect(
        optionalSize,
        `Optional schema (${String(optionalSize)} chars) should not be significantly larger ` +
          `than required schema (${String(requiredSize)} chars). Large difference indicates ` +
          `the enum is being inlined for optional fields.`
      ).toBeLessThan(requiredSize + 200); // allow only a small structural difference
    });
  });
});
