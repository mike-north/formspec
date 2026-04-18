import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FormSpecConfig } from "@formspec/config";
import { defineCustomType, defineExtension } from "@formspec/core/internals";
import { type ClassSchemas, generateSchemas } from "../generators/class-schema.js";
import type { JsonSchema2020 } from "../json-schema/ir-generator.js";
import { numericExtension } from "./fixtures/example-numeric-extension.js";

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
    // matcher types clean (no unsafe-any from `expect.arrayContaining`) while
    // using the real `JsonSchema2020` typing for property access.
    function findPathOverride(
      result: ClassSchemas,
      fieldName: string,
      predicate: (entry: JsonSchema2020) => boolean
    ): JsonSchema2020 | undefined {
      const field = result.jsonSchema.properties?.[fieldName];
      const allOf = field?.allOf;
      expect(
        allOf,
        `expected allOf on property '${fieldName}' but found ${
          allOf === undefined ? "none" : "empty"
        }`
      ).toBeDefined();
      return allOf?.find(predicate);
    }

    function expectPathOverride(
      result: ClassSchemas,
      fieldName: string,
      segment: string,
      keyword: string,
      value: unknown
    ) {
      const override = findPathOverride(
        result,
        fieldName,
        (entry) => {
          const segmentSchema = entry.properties?.[segment];
          if (segmentSchema === undefined) return false;
          return (segmentSchema as Record<string, unknown>)[keyword] === value;
        }
      );
      expect(
        override,
        `no allOf entry with properties.${segment}.${keyword} === ${String(
          value
        )} on field '${fieldName}'`
      ).toBeDefined();
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

      it("broadens through a deeply-nested path with a distinctive value", () => {
        // Use 42 (distinctive) rather than 0 to guard against an override
        // that happens to match a default.
        const source = `
          ${nameBasedDecimal}
          export interface Nested { inner: { amount: Decimal }; }
          export interface PaymentForm {
            /** @minimum :inner.amount 42 */
            total: Nested;
          }
        `;
        const result = runSchema(source, nameBasedConfig);
        const override = findPathOverride(result, "total", (entry) => {
          const inner = entry.properties?.["inner"];
          const amount = inner?.properties?.["amount"];
          return amount?.minimum === 42;
        });
        expect(
          override,
          "expected nested path override properties.inner.properties.amount.minimum === 42"
        ).toBeDefined();
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
          // Vendor-prefix-agnostic smoke: we don't assert the keyword value
          // because the branded extension uses a different prefix, but we
          // DO require an allOf entry that targets `amount`. A regression
          // that silently drops the override (no throw, no entry) would
          // otherwise pass.
          const result = runSchema(source, brandBasedConfig);
          const override = findPathOverride(
            result,
            "total",
            (entry) => entry.properties?.["amount"] !== undefined
          );
          expect(
            override,
            `expected a path override entry targeting 'amount' for @${tag}`
          ).toBeDefined();
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
        const result = runSchema(source, brandBasedConfig);
        const override = findPathOverride(
          result,
          "total",
          (entry) => entry.properties?.["amount"] !== undefined
        );
        expect(override).toBeDefined();
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
        // Tighten to require both the offending segment (amount) and tag
        // (pattern) so a TYPE_MISMATCH from an unrelated code path can't
        // silently pass this assertion.
        expect(() => runSchema(source, nameBasedConfig)).toThrow(
          /TYPE_MISMATCH.*amount.*pattern|pattern.*amount/
        );
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

    // Symbol-based registration is a separate shape from name / brand: it
    // pairs a `defineCustomType<T>()` type parameter in the config file with
    // the user-visible alias in the source. `generateSchemas` resolves the
    // symbol map via the `configPath` option, so the integration test
    // requires a multi-file fixture (decimal.ts + formspec.config.ts +
    // model.ts). Uses a `typeName` that does NOT match the alias identifier
    // so name-based lookup cannot accidentally satisfy the test.
    describe("symbol-based registration (defineCustomType<T>())", () => {
      let tmpDir: string;
      let modelPath: string;
      let configPath: string;

      beforeAll(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-symbol-broadening-"));

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

        fs.writeFileSync(
          path.join(tmpDir, "decimal.ts"),
          [
            "declare const __sym_decimal: unique symbol;",
            "export type SymDecimal = string & { readonly [__sym_decimal]: true };",
          ].join("\n")
        );

        configPath = path.join(tmpDir, "formspec.config.ts");
        fs.writeFileSync(
          configPath,
          [
            'import type { SymDecimal } from "./decimal.js";',
            'import { defineCustomType, defineExtension } from "@formspec/core";',
            "",
            "export const extension = defineExtension({",
            '  extensionId: "x-symtest",',
            "  types: [",
            "    defineCustomType<SymDecimal>({",
            // typeName intentionally does NOT match the alias identifier
            // ("SymDecimal") — this forces resolution to go through the
            // symbol map rather than the name map.
            '      typeName: "OpaqueDecimal",',
            "      builtinConstraintBroadenings: [",
            '        { tagName: "minimum", constraintName: "DecimalMinimum" },',
            '        { tagName: "exclusiveMinimum", constraintName: "DecimalExclusiveMinimum" },',
            "      ],",
            '      toJsonSchema: () => ({ type: "string" }),',
            "    }),",
            "  ],",
            "});",
          ].join("\n")
        );

        modelPath = path.join(tmpDir, "model.ts");
        fs.writeFileSync(
          modelPath,
          [
            'import type { SymDecimal } from "./decimal.js";',
            "",
            "export interface MonetaryAmount {",
            "  amount: SymDecimal;",
            "  currency: string;",
            "}",
            "",
            "export interface PaymentForm {",
            "  /** @exclusiveMinimum :amount 0 */",
            "  total: MonetaryAmount;",
            "}",
          ].join("\n")
        );
      });

      afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      });

      it("broadens @exclusiveMinimum through a path target onto a symbol-registered custom type", () => {
        // The in-memory registration here mirrors the `defineCustomType<SymDecimal>`
        // in the on-disk config file. `generateSchemas` walks the config
        // file's AST (via `configPath`) to extract the `SymDecimal` type
        // parameter and build the symbol map — no runtime import of the
        // config file occurs. The registry's name map is keyed by
        // "OpaqueDecimal" (the typeName), NOT by the alias "SymDecimal" —
        // so only the symbol-based lookup path can satisfy this test.
        const opaqueDecimal = defineCustomType({
          typeName: "OpaqueDecimal",
          builtinConstraintBroadenings: [
            { tagName: "minimum", constraintName: "DecimalMinimum" },
            { tagName: "exclusiveMinimum", constraintName: "DecimalExclusiveMinimum" },
          ],
          toJsonSchema: () => ({ type: "string" }),
        });
        const extension = defineExtension({
          extensionId: "x-symtest",
          types: [opaqueDecimal],
        });
        const result = generateSchemas({
          filePath: modelPath,
          typeName: "PaymentForm",
          errorReporting: "throw",
          config: { extensions: [extension], vendorPrefix: "x-symtest" },
          configPath,
        });
        const override = findPathOverride(
          result,
          "total",
          (entry) => entry.properties?.["amount"] !== undefined
        );
        expect(
          override,
          "expected a path override entry targeting 'amount' on the symbol-registered custom type"
        ).toBeDefined();
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
