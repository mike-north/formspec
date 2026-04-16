/**
 * Tests for the builtin Integer type (`number & { readonly [__integerBrand]: true }`).
 *
 * Verifies that:
 *   1. Integer-branded types resolve to `{ type: "integer" }` in JSON Schema.
 *   2. Numeric constraint TSDoc tags (@minimum, @maximum, etc.) are valid on Integer fields.
 *   3. Type alias chains ending in Integer still resolve to `"integer"`.
 *   4. Optional Integer fields are excluded from the root `required` array.
 *
 * The `declare const __integerBrand: unique symbol` declaration in each fixture
 * is structurally identical to the exported symbol from `@formspec/core`. The
 * class-analyzer detects the brand by the TypeScript-internal property name prefix
 * `__@___integerBrand` (three underscores), which is produced for any `unique symbol`
 * variable named `__integerBrand` regardless of where it is declared.
 *
 * @see packages/build/src/analyzer/class-analyzer.ts — isIntegerBrandedType
 * @see packages/core/src/types/integer.ts — Integer type definition
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSchemas, type GenerateSchemasOptions } from "../generators/class-schema.js";

function generateSchemasOrThrow(options: Omit<GenerateSchemasOptions, "errorReporting">) {
  return generateSchemas({
    ...options,
    errorReporting: "throw",
  });
}

// ---------------------------------------------------------------------------
// Fixture setup
// ---------------------------------------------------------------------------

/**
 * All integer fixture types live in a single temp-dir source file so the
 * TypeScript program compiles them together with a consistent set of compiler
 * options. The temp dir is created once in `beforeAll` and torn down in
 * `afterAll`.
 */
let fixturePath: string;
let tmpDir: string;

const FIXTURE_SOURCE = [
  // Local unique-symbol brand — structurally identical to @formspec/core's export.
  "declare const __integerBrand: unique symbol;",
  "type Integer = number & { readonly [__integerBrand]: true };",
  "",
  // 1. Basic Integer field
  "export interface IntegerFieldsConfig {",
  "  count: Integer;",
  "}",
  "",
  // 2. Integer with @minimum / @maximum constraints
  "export interface ConstrainedIntegerConfig {",
  "  /** @minimum 0 @maximum 100 */",
  "  percentage: Integer;",
  "}",
  "",
  // 3. Integer alias chain (Percentage → Integer)
  "type Percentage = Integer;",
  "export interface AliasChainConfig {",
  "  score: Percentage;",
  "}",
  "",
  // 4. Optional Integer field
  "export interface OptionalIntegerConfig {",
  "  count?: Integer;",
  "}",
  "",
  // 5. Integer with all numeric constraint keywords
  "export interface AllConstraintsConfig {",
  "  /** @minimum 0 @maximum 100 @exclusiveMinimum 0 @exclusiveMaximum 100 @multipleOf 5 */",
  "  value: Integer;",
  "}",
  "",
  // 6. Mixed: Integer and plain number in the same interface
  "export interface MixedConfig {",
  "  integerField: Integer;",
  "  numberField: number;",
  "}",
].join("\n");

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-integer-type-"));

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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the JSON Schema for a named property, following any `$ref` into
 * `$defs`. Returns the schema object at the $ref target if the property
 * schema only contains a `$ref`, otherwise returns the property schema
 * directly. Applies only single-level $ref resolution.
 */
function resolvePropertySchema(
  result: ReturnType<typeof generateSchemasOrThrow>,
  propertyName: string
): Record<string, unknown> {
  const properties = result.jsonSchema.properties as Record<string, unknown>;
  const propSchema = properties[propertyName];

  expect(propSchema, `Missing property "${propertyName}"`).toBeDefined();
  expect(typeof propSchema).toBe("object");
  expect(propSchema).not.toBeNull();

  const propRecord = propSchema as Record<string, unknown>;
  const ref = typeof propRecord["$ref"] === "string" ? propRecord["$ref"] : undefined;

  if (ref === undefined) {
    return propRecord;
  }

  expect(ref.startsWith("#/$defs/")).toBe(true);
  const defName = ref.replace(/^#\/\$defs\//u, "");
  const defs = result.jsonSchema.$defs ?? {};
  const def = defs[defName];
  expect(def, `Missing $defs entry for ${defName}`).toBeDefined();
  return def as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("builtin Integer type", () => {
  // -------------------------------------------------------------------------
  // 1. Basic Integer → type: integer
  // -------------------------------------------------------------------------
  describe("basic Integer field", () => {
    it("emits type:integer for a plain Integer field", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "IntegerFieldsConfig",
      });

      // The property schema is a $ref into $defs (Integer is a named alias).
      // The $defs entry for Integer must have type: "integer".
      // spec: class-analyzer §isIntegerBrandedType → primitiveKind "integer"
      //       ir-generator §generatePrimitiveType → { type: "integer" }
      const defSchema = resolvePropertySchema(result, "count");
      expect(defSchema).toEqual({ type: "integer" });
    });

    it("includes count in the required array for a required Integer field", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "IntegerFieldsConfig",
      });

      // count is a required interface property (not marked optional with `?`).
      expect(result.jsonSchema.required).toContain("count");
    });

    it("emits $defs.Integer with type:integer", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "IntegerFieldsConfig",
      });

      const defs = result.jsonSchema.$defs ?? {};
      // The Integer named alias is registered in $defs.
      expect(defs).toHaveProperty("Integer");
      expect(defs["Integer"]).toEqual({ type: "integer" });
    });
  });

  // -------------------------------------------------------------------------
  // 2. Integer with @minimum / @maximum → standard constraint keywords
  // -------------------------------------------------------------------------
  describe("Integer with @minimum and @maximum constraints", () => {
    it("emits type:integer alongside minimum and maximum on a constrained Integer field", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "ConstrainedIntegerConfig",
      });

      // The property schema carries the constraints alongside the $ref.
      // The resolved type ($defs/Integer) must still have type: "integer".
      // spec: spec 003 §2.6 — @minimum N → minimum: N, @maximum N → maximum: N
      const properties = result.jsonSchema.properties as Record<string, unknown>;
      const percentageSchema = properties["percentage"] as Record<string, unknown>;

      // Constraints are inlined at property level (co-located with $ref).
      expect(percentageSchema).toMatchObject({
        minimum: 0, // spec 003 §2.6: @minimum 0 → minimum: 0
        maximum: 100, // spec 003 §2.6: @maximum 100 → maximum: 100
      });

      // The $ref resolves to type: "integer" (not "number").
      const defSchema = resolvePropertySchema(result, "percentage");
      expect(defSchema).toEqual({ type: "integer" });
    });
  });

  // -------------------------------------------------------------------------
  // 3. Integer alias chain → still resolves to integer
  // -------------------------------------------------------------------------
  describe("Integer alias chain (Percentage → Integer)", () => {
    it("resolves Percentage (alias of Integer) to type:integer", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "AliasChainConfig",
      });

      // score: Percentage, where type Percentage = Integer.
      // The alias chain must terminate at Integer's brand detection, yielding integer.
      // spec: class-analyzer — transitive alias resolution follows the chain to the branded type
      const defSchema = resolvePropertySchema(result, "score");
      expect(defSchema).toEqual({ type: "integer" });
    });

    it("includes score in required for an alias-chain Integer field", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "AliasChainConfig",
      });

      expect(result.jsonSchema.required).toContain("score");
    });
  });

  // -------------------------------------------------------------------------
  // 4. Optional Integer → excluded from required
  // -------------------------------------------------------------------------
  describe("optional Integer field", () => {
    it("omits count from required when the Integer field is optional", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "OptionalIntegerConfig",
      });

      // count?: Integer → field is optional, so it must NOT appear in required.
      // The property schema itself still resolves to type: "integer".
      expect(result.jsonSchema.required ?? []).not.toContain("count");
    });

    it("still resolves the optional Integer field to type:integer", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "OptionalIntegerConfig",
      });

      const defSchema = resolvePropertySchema(result, "count");
      expect(defSchema).toEqual({ type: "integer" });
    });
  });

  // -------------------------------------------------------------------------
  // 5. Integer with all numeric constraint keywords
  // -------------------------------------------------------------------------
  describe("Integer with all numeric constraint keywords", () => {
    it("emits minimum, maximum, exclusiveMinimum, exclusiveMaximum, and multipleOf on Integer", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "AllConstraintsConfig",
      });

      // All five numeric constraint keywords must appear at the property level.
      // spec 003 §2.6: @minimum, @maximum, @exclusiveMinimum, @exclusiveMaximum, @multipleOf
      const properties = result.jsonSchema.properties as Record<string, unknown>;
      const valueSchema = properties["value"] as Record<string, unknown>;

      expect(valueSchema).toMatchObject({
        minimum: 0, // spec 003 §2.6: @minimum 0
        maximum: 100, // spec 003 §2.6: @maximum 100
        exclusiveMinimum: 0, // spec 003 §2.6: @exclusiveMinimum 0
        exclusiveMaximum: 100, // spec 003 §2.6: @exclusiveMaximum 100
        multipleOf: 5, // spec 003 §2.6: @multipleOf 5
      });
    });

    it("emits type:integer (not type:number) when multipleOf is present on Integer", () => {
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "AllConstraintsConfig",
      });

      // The $defs entry for the Integer type must be type: "integer", not "number".
      // Integer brand detection must take precedence over multipleOf-based promotion.
      const defSchema = resolvePropertySchema(result, "value");
      expect(defSchema["type"]).toBe("integer");
    });
  });

  // -------------------------------------------------------------------------
  // Negative: plain number is NOT treated as Integer
  // -------------------------------------------------------------------------
  describe("non-integer numbers are not promoted", () => {
    it("emits type:number (not type:integer) for a plain number field", () => {
      // This exercises the negative case: a plain `number` field must NOT be
      // confused with an Integer-branded field.
      const result = generateSchemasOrThrow({
        filePath: fixturePath,
        typeName: "ConstrainedIntegerConfig",
      });

      // The ConstrainedIntegerConfig only has Integer fields. Confirm there is
      // no spurious number-typed $defs entry — the only entry should be Integer.
      const defs = result.jsonSchema.$defs ?? {};
      const defNames = Object.keys(defs);
      expect(defNames).toContain("Integer");
      // Every $defs entry that has a type keyword must have type: "integer",
      // not type: "number" — plain number fields don't get a $defs entry here.
      for (const defName of defNames) {
        const defValue = defs[defName] as Record<string, unknown>;
        if (typeof defValue["type"] === "string") {
          expect(defValue["type"], `$defs/${defName} should be integer not number`).not.toBe(
            "number"
          );
        }
      }
    });

    it("plain number field produces type:number, not type:integer", () => {
      const result = generateSchemasOrThrow({ filePath: fixturePath, typeName: "MixedConfig" });

      // Integer field → type: "integer"
      const integerProp = resolvePropertySchema(result, "integerField");
      expect(integerProp).toHaveProperty("type", "integer");

      // Plain number field → type: "number"
      const numberProp = resolvePropertySchema(result, "numberField");
      expect(numberProp).toHaveProperty("type", "number");
    });
  });
});
