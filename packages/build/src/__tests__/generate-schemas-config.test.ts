import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { describe, expect, it } from "vitest";
import type { FormSpecConfig } from "@formspec/config";
import { defineCustomType, defineExtension } from "@formspec/core/internals";
import { type ClassSchemas, generateSchemas } from "../generators/class-schema.js";
import { numericExtension } from "./fixtures/example-numeric-extension.js";

type JsonSchemaObject = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeTempSource(source: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-config-test-"));
  const filePath = path.join(dir, "model.ts");
  fs.writeFileSync(filePath, source);
  return filePath;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateSchemas with FormSpecConfig", () => {
  it("resolves extensionRegistry from config.extensions", () => {
    // Decimal is a custom type registered in numericExtension
    const filePath = writeTempSource(`
      export type Decimal = string & { __brand: "Decimal" };

      export interface PaymentForm {
        amount: Decimal;
      }
    `);

    try {
      const config: FormSpecConfig = {
        extensions: [numericExtension],
        vendorPrefix: "x-formspec",
      };

      const result = generateSchemas({
        filePath,
        typeName: "PaymentForm",
        config,
        errorReporting: "throw",
      });

      // The Decimal type should be resolved from the extension and emitted with vendor prefix
      const amountProp = result.jsonSchema.properties?.["amount"];
      expect(amountProp).toMatchObject({
        type: "string",
        "x-formspec-decimal": true,
      });
    } finally {
      fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    }
  });

  it("resolves vendorPrefix from config", () => {
    const filePath = writeTempSource(`
      export interface SimpleForm {
        name: string;
      }
    `);

    try {
      const config: FormSpecConfig = {
        vendorPrefix: "x-custom",
      };

      const result = generateSchemas({
        filePath,
        typeName: "SimpleForm",
        config,
        errorReporting: "throw",
      });

      expect(result.jsonSchema.properties?.["name"]).toEqual({ type: "string" });
    } finally {
      fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    }
  });

  it("resolves enumSerialization from config", () => {
    const filePath = writeTempSource(`
      export type Status = "active" | "inactive";

      export interface StatusForm {
        status: Status;
      }
    `);

    try {
      const configEnum: FormSpecConfig = { enumSerialization: "enum" };
      const configOneOf: FormSpecConfig = { enumSerialization: "oneOf" };

      const enumResult = generateSchemas({
        filePath,
        typeName: "StatusForm",
        config: configEnum,
        errorReporting: "throw",
      });
      const oneOfResult = generateSchemas({
        filePath,
        typeName: "StatusForm",
        config: configOneOf,
        errorReporting: "throw",
      });

      // With "enum": Status $defs entry uses flat enum representation
      expect(enumResult.jsonSchema.$defs?.["Status"]).toMatchObject({
        enum: ["active", "inactive"],
      });
      expect(enumResult.jsonSchema.$defs?.["Status"]).not.toHaveProperty("oneOf");

      // With "oneOf": Status $defs entry uses oneOf representation
      expect(oneOfResult.jsonSchema.$defs?.["Status"]).toMatchObject({
        oneOf: [{ const: "active" }, { const: "inactive" }],
      });
      expect(oneOfResult.jsonSchema.$defs?.["Status"]).not.toHaveProperty("enum");
    } finally {
      fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    }
  });

  it("resolves metadata from config", () => {
    const filePath = writeTempSource(`
      export interface UserForm {
        userName: string;
      }
    `);

    try {
      const config: FormSpecConfig = {
        metadata: {
          field: {
            apiName: { mode: "prefer-explicit" },
          },
        },
      };

      const result = generateSchemas({
        filePath,
        typeName: "UserForm",
        config,
        errorReporting: "throw",
      });

      // With prefer-explicit: no apiName inference, so the property name is preserved as-is
      expect(result.jsonSchema.properties).toHaveProperty("userName");
    } finally {
      fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    }
  });

  it("direct options override config values", () => {
    const filePath = writeTempSource(`
      export type Status = "active" | "inactive";

      export interface StatusForm {
        status: Status;
      }
    `);

    try {
      // Config says oneOf but direct option says enum — direct option wins
      const config: FormSpecConfig = { enumSerialization: "oneOf" };

      const result = generateSchemas({
        filePath,
        typeName: "StatusForm",
        config,
        enumSerialization: "enum", // overrides config
        errorReporting: "throw",
      });

      // Direct "enum" option wins over config "oneOf"
      expect(result.jsonSchema.$defs?.["Status"]).toMatchObject({
        enum: ["active", "inactive"],
      });
      expect(result.jsonSchema.$defs?.["Status"]).not.toHaveProperty("oneOf");
    } finally {
      fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    }
  });

  // =========================================================================
  // Path-targeted broadening on extension-registered custom types.
  //
  // A built-in constraint tag (e.g. `@exclusiveMinimum`) applied through a
  // path target (`@exclusiveMinimum :amount 0`) must defer to the IR-layer
  // validator when the path resolves to an extension-registered custom type
  // that has broadening for that tag. Previously the compiler-backed
  // validator rejected these at the capability check, silently shadowing
  // legitimate broadening.
  //
  // This suite exercises the full matrix of registration mechanisms
  // (name / brand) × tag kinds × wrapping shapes.
  // =========================================================================
  describe("path-targeted broadening on registered custom types", () => {
    // Separate `Decimal` extension registered via `brand`. Same broadenings
    // as `numericExtension`'s name-registered Decimal, but detected
    // structurally through the computed-property brand key rather than the
    // alias identifier.
    const brandedDecimalExtension = defineExtension({
      extensionId: "x-test/branded-decimal",
      types: [
        defineCustomType({
          typeName: "Decimal",
          brand: "__decimalBrand",
          builtinConstraintBroadenings: [
            { tagName: "minimum", constraintName: "DecimalMinimum" },
            { tagName: "maximum", constraintName: "DecimalMaximum" },
            { tagName: "exclusiveMinimum", constraintName: "DecimalExclusiveMinimum" },
            { tagName: "exclusiveMaximum", constraintName: "DecimalExclusiveMaximum" },
            { tagName: "multipleOf", constraintName: "DecimalMultipleOf" },
          ],
          toJsonSchema: () => ({ type: "string" }),
        }),
      ],
    });

    const nameBasedConfig: FormSpecConfig = {
      extensions: [numericExtension],
      vendorPrefix: "x-formspec",
    };
    const brandBasedConfig: FormSpecConfig = {
      extensions: [brandedDecimalExtension],
      vendorPrefix: "x-test",
    };

    // Source declarations for Decimal under each registration mechanism.
    const nameBasedDecimal = `export type Decimal = string & { readonly __brand: "Decimal" };`;
    const brandBasedDecimal = [
      "declare const __decimalBrand: unique symbol;",
      "export type Decimal = string & { readonly [__decimalBrand]: true };",
    ].join("\n");

    function runSchema(source: string, config: FormSpecConfig) {
      const filePath = writeTempSource(source);
      try {
        return generateSchemas({
          filePath,
          typeName: "PaymentForm",
          config,
          errorReporting: "throw",
        });
      } finally {
        fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
      }
    }

    // A path-target override is emitted as an `allOf` entry with
    // `properties.<segment>.<jsonSchemaKeyword>: <value>`. Asserting via a
    // direct `allOf` shape — then scanning its entries — keeps the Jest
    // matcher types clean (no unsafe-any from `expect.arrayContaining`).
    function expectPathOverride(
      result: ClassSchemas,
      fieldName: string,
      segment: string,
      keyword: string,
      value: unknown
    ) {
      const field = (result.jsonSchema.properties as JsonSchemaObject | undefined)?.[fieldName];
      const allOf = (field as { allOf?: readonly JsonSchemaObject[] } | undefined)?.allOf;
      expect(allOf).toBeDefined();
      const overrideEntry = allOf?.find((entry) => {
        const properties = entry["properties"] as JsonSchemaObject | undefined;
        const segmentSchema = properties?.[segment] as JsonSchemaObject | undefined;
        return segmentSchema !== undefined && segmentSchema[keyword] === value;
      });
      expect(overrideEntry).toBeDefined();
    }

    // Path-target overrides emit the standard JSON Schema keyword directly
    // on the sub-path — not the vendor-prefixed custom-constraint keyword
    // that's used for the type's own direct-target broadening. See the
    // `allOf: [{ $ref }, { properties: { amount: { minimum: 0 } } }]`
    // shape asserted by `expectPathOverride`.
    const numericTagCases: readonly {
      tag: string;
      argument: string;
      jsonKeyword: string;
      jsonValue: number;
    }[] = [
      { tag: "minimum", argument: "0", jsonKeyword: "minimum", jsonValue: 0 },
      { tag: "maximum", argument: "100", jsonKeyword: "maximum", jsonValue: 100 },
      { tag: "exclusiveMinimum", argument: "0", jsonKeyword: "exclusiveMinimum", jsonValue: 0 },
      {
        tag: "exclusiveMaximum",
        argument: "1000",
        jsonKeyword: "exclusiveMaximum",
        jsonValue: 1000,
      },
      { tag: "multipleOf", argument: "0.01", jsonKeyword: "multipleOf", jsonValue: 0.01 },
    ];

    describe("name-based registration (tsTypeNames)", () => {
      it.each(numericTagCases)(
        "broadens @$tag through a path target onto a Decimal subfield",
        ({ tag, argument, jsonKeyword, jsonValue }) => {
          const source = `
            ${nameBasedDecimal}
            export interface MonetaryAmount { amount: Decimal; currency: string; }
            export interface PaymentForm {
              /** @${tag} :amount ${argument} */
              total: MonetaryAmount;
            }
          `;
          const result = runSchema(source, nameBasedConfig);
          expectPathOverride(result, "total", "amount", jsonKeyword, jsonValue);
        }
      );

      it("broadens across a nullable Decimal", () => {
        const source = `
          ${nameBasedDecimal}
          export interface MonetaryAmount { amount: Decimal | null; currency: string; }
          export interface PaymentForm {
            /** @exclusiveMinimum :amount 0 */
            total: MonetaryAmount;
          }
        `;
        const result = runSchema(source, nameBasedConfig);
        expectPathOverride(result, "total", "amount", "exclusiveMinimum", 0);
      });

      it("broadens through a deeply-nested path", () => {
        const source = `
          ${nameBasedDecimal}
          export interface Nested { inner: { amount: Decimal }; }
          export interface PaymentForm {
            /** @minimum :inner.amount 0 */
            total: Nested;
          }
        `;
        const result = runSchema(source, nameBasedConfig);
        // For nested paths, the path override lives inside the top-level
        // "allOf" entry keyed off the first segment; walk the chain manually
        // to avoid unsafe-any from `expect.objectContaining`.
        const total = (result.jsonSchema.properties as JsonSchemaObject | undefined)?.["total"];
        const allOf = (total as { allOf?: readonly JsonSchemaObject[] } | undefined)?.allOf;
        const override = allOf?.find((entry) => {
          const properties = entry["properties"] as JsonSchemaObject | undefined;
          const inner = properties?.["inner"] as JsonSchemaObject | undefined;
          const innerProps = inner?.["properties"] as JsonSchemaObject | undefined;
          const amount = innerProps?.["amount"] as JsonSchemaObject | undefined;
          return amount?.["minimum"] === 0;
        });
        expect(override).toBeDefined();
      });
    });

    describe("brand-based registration", () => {
      it.each(numericTagCases)(
        "broadens @$tag through a path target onto a brand-registered Decimal",
        ({ tag, argument }) => {
          const source = `
            ${brandBasedDecimal}
            export interface MonetaryAmount { amount: Decimal; currency: string; }
            export interface PaymentForm {
              /** @${tag} :amount ${argument} */
              total: MonetaryAmount;
            }
          `;
          // We don't assert the x-prefixed keyword value because the
          // branded extension uses a different vendor prefix; the test only
          // needs to confirm generation succeeds without TYPE_MISMATCH.
          expect(() => runSchema(source, brandBasedConfig)).not.toThrow();
        }
      );

      it("broadens across a nullable brand-registered Decimal", () => {
        const source = `
          ${brandBasedDecimal}
          export interface MonetaryAmount { amount: Decimal | null; currency: string; }
          export interface PaymentForm {
            /** @exclusiveMinimum :amount 0 */
            total: MonetaryAmount;
          }
        `;
        expect(() => runSchema(source, brandBasedConfig)).not.toThrow();
      });
    });

    describe("negative cases (fix must not paper over real type mismatches)", () => {
      it("rejects numeric constraints when the path resolves to a non-custom string", () => {
        const source = `
          ${nameBasedDecimal}
          export interface MonetaryAmount { amount: Decimal; currency: string; }
          export interface PaymentForm {
            /** @exclusiveMinimum :currency 0 */
            total: MonetaryAmount;
          }
        `;
        // Assert the error specifically names the offending segment and tag
        // so it cannot mask a TYPE_MISMATCH from a different code path.
        expect(() => runSchema(source, nameBasedConfig)).toThrow(
          /TYPE_MISMATCH.*currency.*exclusiveMinimum|exclusiveMinimum.*currency/
        );
      });

      it("rejects a string-only tag (@pattern) on a numeric-only Decimal path", () => {
        // `@pattern` is a string-like constraint. Decimal has numeric
        // broadenings registered but no string-pattern broadening, so the
        // deferral must not kick in and the capability check must reject.
        const source = `
          ${nameBasedDecimal}
          export interface MonetaryAmount { amount: Decimal; currency: string; }
          export interface PaymentForm {
            /** @pattern :amount ^[0-9]+$ */
            total: MonetaryAmount;
          }
        `;
        expect(() => runSchema(source, nameBasedConfig)).toThrow(/TYPE_MISMATCH/);
      });

      it("still rejects direct-field capability mismatches (non-path)", () => {
        // Ensures the refactor hasn't regressed the non-path code path:
        // `@exclusiveMinimum` on a bare `string` field must still fail.
        const source = `
          export interface PaymentForm {
            /** @exclusiveMinimum 0 */
            label: string;
          }
        `;
        expect(() => runSchema(source, { vendorPrefix: "x-formspec" })).toThrow(
          /TYPE_MISMATCH/
        );
      });
    });
  });

  it("works without config (backward compatibility)", () => {
    const filePath = writeTempSource(`
      export interface SimpleForm {
        name: string;
      }
    `);

    try {
      const result = generateSchemas({
        filePath,
        typeName: "SimpleForm",
        errorReporting: "throw",
      });

      expect(result.jsonSchema.properties?.["name"]).toEqual({ type: "string" });
    } finally {
      fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    }
  });
});
