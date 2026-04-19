/**
 * Regression tests for issue #309: named types used as optional properties are not
 * placed in `$defs` / referenced via `$ref`.
 *
 * Root cause: TypeScript's type checker produces `T | undefined` for an optional
 * property `prop?: T`. This synthesized union loses the `aliasSymbol` from the
 * original alias, so the class-analyzer never looks up the alias declaration and
 * never registers it in the `typeRegistry`. The result is that the type is inlined
 * at every usage site rather than deduplicated into `$defs`, ballooning schema size.
 *
 * This affects both:
 *   - String-union enum aliases (e.g. `type Currency = "AED" | "AFN" | ...`)
 *   - Object-shape type aliases (e.g. `type Address = { street: string; city: string }`)
 *
 * For large enums (e.g., 157 ISO 4217 currency codes) used across multiple fields
 * this can exceed server-side string length limits (e.g., 5000 chars).
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
// Fixture sources
// ---------------------------------------------------------------------------

/**
 * 20-member string union used as both required and optional properties.
 * - `required` usage: `currency: Currency` (required field)
 * - `optional` usage: `currency?: Currency` (optional field — triggers the bug)
 *
 * The bug: when `currency?: Currency` is optional, TypeScript synthesizes
 * `Currency | undefined`. The synthesized union loses `aliasSymbol`, so the
 * class-analyzer never registers `Currency` in the typeRegistry, causing
 * the enum to be inlined instead of referenced via `$ref`.
 */
const ENUM_FIXTURE_SOURCE = [
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
  "",
  // Mixed-kind union: string literals + an object member. The alias itself is a union.
  "interface SomeObject { id: number; }",
  'type MixedUnion = "a" | "b" | SomeObject;',
  "export class MixedUnionConfig {",
  "  x?: MixedUnion;",
  "  y?: MixedUnion;",
  "}",
  "",
  // Single-use alias — used only once. Documents the current behavior.
  'type SingleUseAlias = "only" | "here";',
  "export class SingleUseConfig {",
  "  field?: SingleUseAlias;",
  "}",
  "",
  // readonly modifier — should still deduplicate correctly.
  "export class ReadonlyCurrencyConfig {",
  "  readonly currency?: Currency;",
  "  readonly currency2?: Currency;",
  "}",
].join("\n");

/**
 * Object-shape type alias used as an optional property across multiple classes.
 *
 * The parallel bug: when `addr?: Address` is optional, TypeScript synthesizes
 * `Address | undefined`. `resolveUnionType` is invoked. The recovery block
 * previously only accepted aliases whose underlying type `.isUnion()`, so it
 * skipped object-shape aliases. The resolved anonymous object has no aliasSymbol,
 * causing `Address` to be inlined rather than registered in `$defs`.
 *
 * Fix: `resolveNamedTypeWithSourceRecovery` now recovers aliases whose underlying
 * type is either a union or an object shape, so object-shape aliases like
 * `Address` are recovered in this optional-property path as well. The single
 * non-null union member is then processed with the correct alias context.
 */
const OBJECT_ALIAS_FIXTURE_SOURCE = [
  "type Address = { street: string; city: string; zip: string; };",
  "",
  "export class PersonWithOptionalAddress {",
  "  name!: string;",
  "  homeAddr?: Address;",
  "  workAddr?: Address;",
  "}",
  "",
  "export class PersonWithRequiredAddress {",
  "  name!: string;",
  "  homeAddr!: Address;",
  "  workAddr!: Address;",
  "}",
].join("\n");

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let enumFixturePath: string;
let objectAliasFixturePath: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-defs-dedup-"));

  const tsconfig = JSON.stringify(
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
  );
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), tsconfig);

  enumFixturePath = path.join(tmpDir, "enum-fixture.ts");
  fs.writeFileSync(enumFixturePath, ENUM_FIXTURE_SOURCE);

  objectAliasFixturePath = path.join(tmpDir, "object-alias-fixture.ts");
  fs.writeFileSync(objectAliasFixturePath, OBJECT_ALIAS_FIXTURE_SOURCE);
});

afterAll(() => {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

/** Convenience wrapper to generate and return schemas for a type in the enum fixture. */
function generateEnum(typeName: string) {
  return generateSchemasOrThrow({ filePath: enumFixturePath, typeName });
}

/** Convenience wrapper to generate and return schemas for a type in the object alias fixture. */
function generateObj(typeName: string) {
  return generateSchemasOrThrow({ filePath: objectAliasFixturePath, typeName });
}

// ---------------------------------------------------------------------------
// Tests — issue #309 regression
// ---------------------------------------------------------------------------

describe("$defs deduplication — issue #309", () => {
  // -------------------------------------------------------------------------
  // Baseline: required fields work correctly (these were NOT broken)
  // -------------------------------------------------------------------------
  describe("baseline (required fields)", () => {
    it("places Currency in $defs for a required currency field", () => {
      const result = generateEnum("RequiredCurrencyConfig");
      const defs = result.jsonSchema.$defs ?? {};
      expect(Object.keys(defs), "Expected Currency in $defs for required field").toContain(
        "Currency"
      );
    });

    it("uses $ref for Currency inside MonetaryAmount when field is required", () => {
      const result = generateEnum("RequiredCurrencyConfig");
      const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
      const monetary = expectRecord(defs["MonetaryAmount"], "$defs.MonetaryAmount");
      const props = expectRecord(monetary["properties"], "MonetaryAmount.properties");
      // spec: JSON Schema 2020-12 §10.2.1 — named aliases go in $defs, referenced via $ref
      expect(props["currency"]?.$ref).toBe("#/$defs/Currency");
    });

    it("places Address in $defs for a required address field", () => {
      const result = generateObj("PersonWithRequiredAddress");
      const defs = result.jsonSchema.$defs ?? {};
      expect(Object.keys(defs), "Expected Address in $defs for required field").toContain(
        "Address"
      );
    });
  });

  // -------------------------------------------------------------------------
  // Bug: optional string-union enum alias nested in an interface
  // -------------------------------------------------------------------------
  describe("optional string-union enum alias nested in an interface (bug fix)", () => {
    it("places Currency in $defs even when the property is optional (currency?: Currency)", () => {
      const result = generateEnum("OptionalCurrencyConfig");
      const defs = result.jsonSchema.$defs ?? {};
      expect(
        Object.keys(defs),
        "Expected Currency in $defs even when currency?: Currency is optional. " +
          "The bug inlines the enum instead."
      ).toContain("Currency");
    });

    it("uses $ref for Currency inside OptionalMonetaryAmount.$defs entry", () => {
      const result = generateEnum("OptionalCurrencyConfig");
      const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
      const monetary = expectRecord(defs["OptionalMonetaryAmount"], "$defs.OptionalMonetaryAmount");
      const props = expectRecord(monetary["properties"], "OptionalMonetaryAmount.properties");
      const currencyProp = expectRecord(props["currency"], "currency property");
      // spec: class-analyzer §resolveUnionType — named alias recovered from source node
      expect(
        currencyProp["$ref"],
        "Expected currency to use $ref to Currency (not an inline enum)"
      ).toBe("#/$defs/Currency");
    });

    it("does not inline the enum directly in OptionalMonetaryAmount (no 'enum' key on currency prop)", () => {
      const result = generateEnum("OptionalCurrencyConfig");
      const defs = result.jsonSchema.$defs ?? {};
      const monetary = defs["OptionalMonetaryAmount"] as Record<string, unknown> | undefined;
      const props = monetary?.["properties"] as Record<string, unknown> | undefined;
      const currencyProp = props?.["currency"] as Record<string, unknown> | undefined;
      expect(
        currencyProp?.["enum"],
        "Currency should NOT be inlined — expected a $ref, not an enum"
      ).toBeUndefined();
    });

    it("enum literal 'AED' appears exactly once in the full schema (deduplication invariant)", () => {
      // spec: each named alias must appear exactly once in $defs, not inlined at each usage site.
      const result = generateEnum("OptionalCurrencyConfig");
      const schemaStr = JSON.stringify(result.jsonSchema);
      const count = schemaStr.split('"AED"').length - 1;
      expect(count, 'Expected "AED" to appear exactly once (in $defs/Currency)').toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Bug: optional enum field directly on a class (no intermediate interface)
  // -------------------------------------------------------------------------
  describe("optional enum field directly on a class (bug fix)", () => {
    it("places Currency in $defs when optional currency fields are on the class directly", () => {
      const result = generateEnum("DirectOptionalCurrencyConfig");
      const defs = result.jsonSchema.$defs ?? {};
      expect(
        Object.keys(defs),
        "Expected Currency in $defs for direct optional field curr1?: Currency"
      ).toContain("Currency");
    });

    it("uses $ref for each optional currency field on the class", () => {
      const result = generateEnum("DirectOptionalCurrencyConfig");
      const props = result.jsonSchema.properties as Record<string, Record<string, unknown>>;
      for (const fieldName of ["curr1", "curr2", "curr3"]) {
        const fieldSchema = expectRecord(props[fieldName], `Expected ${fieldName} to be defined`);
        expect(
          fieldSchema["enum"],
          `Expected ${fieldName} NOT to have an inline enum — should use $ref to Currency`
        ).toBeUndefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Bug: optional object-shape type alias (#309 parallel bug)
  // -------------------------------------------------------------------------
  describe("optional object-shape type alias (parallel bug in resolveUnionType)", () => {
    it("places Address in $defs when addr?: Address is optional", () => {
      // This test would fail against the pre-fix code. The recovery block in
      // resolveUnionType previously checked `aliasUnderlyingType.isUnion()` and
      // skipped object-shape aliases. Without recovery, the anonymous object body
      // has no aliasSymbol, so Address was inlined at every usage site.
      //
      // Fix: resolveNamedTypeWithSourceRecovery now recovers aliases whose
      // underlying type is either a union or an object shape, so object-shape
      // aliases like Address are recovered in this optional-property path too.
      // See issue #309 (shared object types section).
      const result = generateObj("PersonWithOptionalAddress");
      const defs = result.jsonSchema.$defs ?? {};
      expect(
        Object.keys(defs),
        "Expected Address in $defs even when homeAddr?: Address is optional. " +
          "The parallel bug inlines the object shape instead."
      ).toContain("Address");
    });

    it("uses $ref for homeAddr and workAddr (not inline object shapes)", () => {
      const result = generateObj("PersonWithOptionalAddress");
      const props = result.jsonSchema.properties as Record<string, Record<string, unknown>>;

      // Each optional address field should reference $defs/Address, not embed the shape inline.
      for (const fieldName of ["homeAddr", "workAddr"]) {
        const fieldSchema = expectRecord(props[fieldName], `Expected ${fieldName} to be defined`);
        // May be wrapped in anyOf/oneOf for optional semantics; the $ref should appear somewhere.
        const fieldStr = JSON.stringify(fieldSchema);
        expect(
          fieldStr,
          `Expected ${fieldName} to reference $defs/Address via $ref`
        ).toContain('"$ref":"#/$defs/Address"');
        // The inline object properties should NOT appear on the field schema itself.
        expect(
          fieldStr,
          `Expected ${fieldName} NOT to inline the Address shape`
        ).not.toContain('"street"');
      }
    });

    it("does not significantly bloat schema when address is optional vs required", () => {
      const required = generateObj("PersonWithRequiredAddress");
      const optional = generateObj("PersonWithOptionalAddress");
      const requiredStr = JSON.stringify(required.jsonSchema);
      const optionalStr = JSON.stringify(optional.jsonSchema);

      // Both schemas should reference Address via $ref. Without the fix the optional
      // schema inlines the full object shape at every usage site.
      const refCountRequired = requiredStr.split('"$ref":"#/$defs/Address"').length - 1;
      const refCountOptional = optionalStr.split('"$ref":"#/$defs/Address"').length - 1;

      expect(refCountRequired, "Required schema should have $ref to Address").toBeGreaterThan(0);
      expect(refCountOptional, "Optional schema should have $ref to Address").toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Mixed-kind union optional (#309 additional coverage)
  // -------------------------------------------------------------------------
  describe("mixed-kind union (string literals + object) as optional property", () => {
    it("places MixedUnion in $defs when x?: MixedUnion is optional", () => {
      const result = generateEnum("MixedUnionConfig");
      const defs = result.jsonSchema.$defs ?? {};
      expect(
        Object.keys(defs),
        "Expected MixedUnion in $defs when used as an optional property"
      ).toContain("MixedUnion");
    });

    it("each usage of MixedUnion references $defs via $ref (no inline expansion)", () => {
      const result = generateEnum("MixedUnionConfig");
      const schemaStr = JSON.stringify(result.jsonSchema);
      // The union definition should appear exactly once in $defs, not inlined per field.
      const inlinedLiteralCount = schemaStr.split('"a"').length - 1;
      // "a" appears in the $defs/MixedUnion definition (1 time) but not inline per field.
      expect(
        inlinedLiteralCount,
        'Expected "a" to appear exactly once (deduplicated in $defs/MixedUnion)'
      ).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // readonly modifier — should still deduplicate
  // -------------------------------------------------------------------------
  describe("readonly modifier on optional enum property", () => {
    it("places Currency in $defs even when property has readonly modifier", () => {
      const result = generateEnum("ReadonlyCurrencyConfig");
      const defs = result.jsonSchema.$defs ?? {};
      expect(
        Object.keys(defs),
        "Expected Currency in $defs for readonly currency?: Currency"
      ).toContain("Currency");
    });

    it("enum literal 'AED' appears exactly once even with readonly optional fields", () => {
      const result = generateEnum("ReadonlyCurrencyConfig");
      const schemaStr = JSON.stringify(result.jsonSchema);
      const count = schemaStr.split('"AED"').length - 1;
      expect(count, 'Expected "AED" to appear exactly once (not inlined per readonly field)').toBe(
        1
      );
    });
  });

  // -------------------------------------------------------------------------
  // Single-use alias — documents current behavior re: issue #309
  // -------------------------------------------------------------------------
  describe("single-use alias contract (issue #309)", () => {
    it("places SingleUseAlias in $defs even when it appears only once as an optional field", () => {
      // Contract: named type aliases are lifted into $defs regardless of how many
      // times they appear, so long as their alias name is recoverable. A single-use
      // alias used as an optional property must also be recoverable.
      // See issue #309 — all named aliases should be consistently handled.
      const result = generateEnum("SingleUseConfig");
      const defs = result.jsonSchema.$defs ?? {};
      expect(
        Object.keys(defs),
        "Expected SingleUseAlias in $defs even when used only once as field?: SingleUseAlias"
      ).toContain("SingleUseAlias");
    });
  });

  // -------------------------------------------------------------------------
  // Schema size regression guard
  // -------------------------------------------------------------------------
  describe("schema size regression guard", () => {
    it("enum literal 'AED' appears exactly once in optional-nested variant (not inlined per field)", () => {
      const result = generateEnum("OptionalCurrencyConfig");
      const schemaStr = JSON.stringify(result.jsonSchema);
      const count = schemaStr.split('"AED"').length - 1;
      // spec: each enum member appears exactly once in $defs/Currency, never inlined.
      // Without the fix, 'AED' appears inside OptionalMonetaryAmount's $defs entry as well.
      expect(
        count,
        `'AED' should appear exactly once in the schema (deduplicated). ` +
          `Found ${String(count)} occurrences — this indicates inlining.`
      ).toBe(1);
    });

    it("optional variant schema is not significantly larger than required variant", () => {
      const required = generateEnum("RequiredCurrencyConfig");
      const optional = generateEnum("OptionalCurrencyConfig");

      const requiredSize = JSON.stringify(required.jsonSchema).length;
      const optionalSize = JSON.stringify(optional.jsonSchema).length;

      // Without the fix, the optional schema inlines the 20-member enum inside
      // OptionalMonetaryAmount's $defs entry, making it noticeably larger than
      // the required schema (which uses $ref). The difference should be small
      // after the fix (only a few chars for the `required` array difference).
      expect(
        optionalSize,
        `Optional schema (${String(optionalSize)} chars) should not be significantly larger ` +
          `than required schema (${String(requiredSize)} chars). Large difference indicates ` +
          `the enum is being inlined for optional fields.`
      ).toBeLessThan(requiredSize + 200);
    });
  });
});
