import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FormSpecConfig } from "@formspec/config";
import { defineConstraint, defineCustomType, defineExtension } from "@formspec/core/internals";
import { type ClassSchemas, generateSchemas } from "../src/generators/class-schema.js";
import type { JsonSchema2020 } from "../src/json-schema/ir-generator.js";
import { numericExtension } from "./fixtures/example-numeric-extension.js";
import {
  vocabDecimalByNameExtension,
  vocabDecimalByBrandExtension,
} from "./fixtures/example-vocabulary-decimal-extension.js";
import { vocabStringExtension } from "./fixtures/example-vocabulary-string-extension.js";

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

  it("resolves smart-size enumSerialization from config", () => {
    const filePath = writeTempSource(`
      export type PlanStatus = "draft" | "sent";

      export interface InvoiceModel {
        status: PlanStatus;
      }
    `);

    try {
      const config: FormSpecConfig = {
        enumSerialization: "smart-size",
        metadata: {
          enumMember: {
            displayName: {
              mode: "infer-if-missing",
              infer: ({ logicalName }) => (logicalName === "draft" ? "Draft" : logicalName),
            },
          },
        },
      };

      const result = generateSchemas({
        filePath,
        typeName: "InvoiceModel",
        config,
        errorReporting: "throw",
      });

      expect(result.jsonSchema.$defs?.["PlanStatus"]).toMatchObject({
        oneOf: [{ const: "draft", title: "Draft" }, { const: "sent" }],
      });
      expect(result.jsonSchema.$defs?.["PlanStatus"]).not.toHaveProperty("enum");
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
            apiName: { mode: "disabled" },
          },
        },
      };

      const result = generateSchemas({
        filePath,
        typeName: "UserForm",
        config,
        errorReporting: "throw",
      });

      // With disabled: no apiName inference, so the property name is preserved as-is
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
  // path target (`@exclusiveMinimum :amount 0`) must defer to the broadening
  // registration when the path resolves to an extension-registered custom type
  // that has broadening for that tag.
  //
  // After the fix (issue #395), the emitted schema must use the custom
  // constraint's vocabulary keyword (e.g. `decimalExclusiveMinimum: "0"`)
  // rather than the raw built-in keyword (`exclusiveMinimum: 0`). The payload
  // is a string because the vocabulary-mode fixture's `parseValue` is
  // `trimmedString` — no numeric coercion.
  //
  // This suite uses the vocabulary-decimal fixture (`example-vocabulary-decimal-
  // extension.ts`) so assertions can pin the exact camelCase keyword without
  // accounting for vendor-prefix construction. The existing `numericExtension`
  // is preserved for non-path-broadening tests elsewhere.
  //
  // Matrix: registration mechanism (name / brand / symbol) × tag kind × shape
  // (direct, nullable, nested).
  // =========================================================================
  describe("path-targeted broadening on registered custom types", () => {
    // -----------------------------------------------------------------------
    // Source declarations under each registration mechanism
    // -----------------------------------------------------------------------

    /**
     * Name-based: resolved via `tsTypeNames: ["VocabDecimal"]`.
     * The alias name matches the registered `tsTypeName` exactly.
     */
    const nameBasedDecimal = `export type VocabDecimal = string & { readonly __brand: "VocabDecimal" };`;

    /**
     * Brand-based: resolved structurally via `brand: "__vocabDecimalBrand"`.
     * The unique-symbol computed property key is what the extension registry
     * detects, not the alias name.
     */
    const brandBasedDecimal = [
      "declare const __vocabDecimalBrand: unique symbol;",
      "export type Decimal = string & { readonly [__vocabDecimalBrand]: true };",
    ].join("\n");

    const nameBasedConfig: FormSpecConfig = {
      extensions: [vocabDecimalByNameExtension],
      vendorPrefix: "x-test",
    };
    const brandBasedConfig: FormSpecConfig = {
      extensions: [vocabDecimalByBrandExtension],
      vendorPrefix: "x-test",
    };

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

    // -----------------------------------------------------------------------
    // Path-override navigation helpers
    //
    // Path-target overrides are emitted as sibling keywords alongside `$ref`
    // (JSON Schema 2020-12 §10.2.1). The `properties` override appears directly
    // on the field schema, not wrapped in `allOf`.
    // See: https://github.com/mike-north/formspec/issues/364
    // -----------------------------------------------------------------------

    /**
     * Locate the first field schema that satisfies `predicate`. Returns the
     * field schema object, or `undefined` if the predicate never matches.
     */
    function findPathOverride(
      result: ClassSchemas,
      fieldName: string,
      predicate: (schema: JsonSchema2020) => boolean
    ): JsonSchema2020 | undefined {
      const field = result.jsonSchema.properties?.[fieldName];
      expect(field, `expected a schema for property '${fieldName}'`).toBeDefined();
      if (field !== undefined && predicate(field)) {
        return field;
      }
      return undefined;
    }

    /**
     * Assert that `result.jsonSchema.properties[fieldName].properties[segment][keyword] === value`.
     *
     * Used for one-segment path targets (`:amount`).
     */
    function expectPathOverride(
      result: ClassSchemas,
      fieldName: string,
      segment: string,
      keyword: string,
      value: unknown
    ) {
      const field = result.jsonSchema.properties?.[fieldName];
      expect(field, `expected schema for field '${fieldName}'`).toBeDefined();
      const segmentSchema = field?.properties?.[segment];
      expect(
        segmentSchema,
        `expected field '${fieldName}' to have sibling properties.${segment} (path override)`
      ).toBeDefined();
      expect(
        (segmentSchema as Record<string, unknown>)[keyword],
        `expected properties.${segment}.${keyword} === ${String(value)} on field '${fieldName}'`
      ).toBe(value);
    }

    /**
     * Assert that a broadened vocabulary keyword appears on the path-override
     * segment schema. This is the post-fix form: the keyword is the camelCase
     * vocabulary keyword (e.g. `decimalExclusiveMinimum`) and the payload is
     * a string (e.g. `"0"`).
     *
     * This helper is a named alias for `expectPathOverride` with clearer
     * intent at the call site when asserting broadened output.
     *
     * @param result - The schema generation result.
     * @param fieldName - The field whose path override is being checked.
     * @param segment - The final path segment (e.g. `"amount"`).
     * @param vocabularyKeyword - The camelCase vocabulary keyword (e.g. `"decimalExclusiveMinimum"`).
     * @param payload - The string payload (e.g. `"0"`).
     */
    function expectBroadenedPathOverride(
      result: ClassSchemas,
      fieldName: string,
      segment: string,
      vocabularyKeyword: string,
      payload: string
    ) {
      expectPathOverride(result, fieldName, segment, vocabularyKeyword, payload);
    }

    // -----------------------------------------------------------------------
    // Tag test matrix
    //
    // Each entry describes one built-in tag and its expected broadened output
    // after the fix (issue #395). The `vocabKeyword` is the camelCase keyword
    // emitted by the vocabulary-decimal extension; `payload` is the string
    // value from `trimmedString(argument)`.
    // -----------------------------------------------------------------------
    const numericTagCases: readonly {
      tag: string;
      argument: string;
      vocabKeyword: string;
      payload: string;
    }[] = [
      // @see https://github.com/mike-north/formspec/issues/395
      // Each tag must produce the broadened vocabulary keyword (not the raw
      // built-in keyword) when the path terminal type is a registered custom
      // type with a broadening for that tag.
      { tag: "minimum", argument: "0", vocabKeyword: "decimalMinimum", payload: "0" },
      { tag: "maximum", argument: "100", vocabKeyword: "decimalMaximum", payload: "100" },
      {
        tag: "exclusiveMinimum",
        argument: "0",
        vocabKeyword: "decimalExclusiveMinimum",
        payload: "0",
      },
      {
        tag: "exclusiveMaximum",
        argument: "1000",
        vocabKeyword: "decimalExclusiveMaximum",
        payload: "1000",
      },
      {
        tag: "multipleOf",
        argument: "0.01",
        vocabKeyword: "decimalMultipleOf",
        payload: "0.01",
      },
    ];

    // -----------------------------------------------------------------------
    // Name-based registration
    // -----------------------------------------------------------------------
    describe("name-based registration (tsTypeNames)", () => {
      it.each(numericTagCases)(
        "broadens @$tag through a path target onto a VocabDecimal subfield",
        ({ tag, argument, vocabKeyword, payload }) => {
          const source = `
            ${nameBasedDecimal}
            export interface MonetaryAmount { amount: VocabDecimal; currency: string; }
            export interface PaymentForm {
              /** @${tag} :amount ${argument} */
              total: MonetaryAmount;
            }
          `;
          const result = runSchema(source, nameBasedConfig);
          // Post-fix (#395): must emit the broadened vocabulary keyword, not
          // the raw built-in keyword.
          expectBroadenedPathOverride(result, "total", "amount", vocabKeyword, payload);
        }
      );

      it("broadens across a nullable VocabDecimal", () => {
        // Nullability of the path-terminal type must not suppress broadening.
        const source = `
          ${nameBasedDecimal}
          export interface MonetaryAmount { amount: VocabDecimal | null; currency: string; }
          export interface PaymentForm {
            /** @exclusiveMinimum :amount 0 */
            total: MonetaryAmount;
          }
        `;
        const result = runSchema(source, nameBasedConfig);
        expectBroadenedPathOverride(result, "total", "amount", "decimalExclusiveMinimum", "0");
      });

      it("broadens through a deeply-nested path with a distinctive value", () => {
        // Use 42 (distinctive) rather than 0 to guard against an override
        // that happens to match a default.
        // Post-fix (#395): nested path terminals must also produce broadened keywords.
        const source = `
          ${nameBasedDecimal}
          export interface Nested { inner: { amount: VocabDecimal }; }
          export interface PaymentForm {
            /** @minimum :inner.amount 42 */
            total: Nested;
          }
        `;
        const result = runSchema(source, nameBasedConfig);
        const override = findPathOverride(result, "total", (entry) => {
          const inner = entry.properties?.["inner"];
          const amount = inner?.properties?.["amount"];
          // Post-fix: broadened keyword with string payload, not numeric minimum
          return (amount as Record<string, unknown> | undefined)?.["decimalMinimum"] === "42";
        });
        expect(
          override,
          "expected nested path override properties.inner.properties.amount.decimalMinimum === '42'"
        ).toBeDefined();
      });
    });

    // -----------------------------------------------------------------------
    // Brand-based registration
    // -----------------------------------------------------------------------
    describe("brand-based registration", () => {
      it.each(numericTagCases)(
        "broadens @$tag through a path target onto a brand-registered VocabDecimal",
        ({ tag, argument, vocabKeyword, payload }) => {
          const source = `
            ${brandBasedDecimal}
            export interface MonetaryAmount { amount: Decimal; currency: string; }
            export interface PaymentForm {
              /** @${tag} :amount ${argument} */
              total: MonetaryAmount;
            }
          `;
          const result = runSchema(source, brandBasedConfig);
          // Post-fix (#395): brand-registered custom types must also produce
          // the broadened vocabulary keyword, not a raw built-in keyword.
          expectBroadenedPathOverride(result, "total", "amount", vocabKeyword, payload);
        }
      );

      it("broadens across a nullable brand-registered VocabDecimal", () => {
        const source = `
          ${brandBasedDecimal}
          export interface MonetaryAmount { amount: Decimal | null; currency: string; }
          export interface PaymentForm {
            /** @exclusiveMinimum :amount 0 */
            total: MonetaryAmount;
          }
        `;
        const result = runSchema(source, brandBasedConfig);
        expectBroadenedPathOverride(result, "total", "amount", "decimalExclusiveMinimum", "0");
      });
    });

    // -----------------------------------------------------------------------
    // Negative cases (fix must not paper over real type mismatches)
    // -----------------------------------------------------------------------
    describe("negative cases (fix must not paper over real type mismatches)", () => {
      it("rejects numeric constraints when the path resolves to a non-custom string", () => {
        // `currency: string` has no broadening registered — the fix must NOT
        // silently fall through when the terminal type is a plain string.
        const source = `
          ${nameBasedDecimal}
          export interface MonetaryAmount { amount: VocabDecimal; currency: string; }
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

      it("rejects a string-only tag (@pattern) on a numeric-only VocabDecimal path", () => {
        // `@pattern` is a string-like constraint. VocabDecimal has numeric
        // broadenings registered but no string-pattern broadening, so the
        // deferral must not kick in and the capability check must reject.
        const source = `
          ${nameBasedDecimal}
          export interface MonetaryAmount { amount: VocabDecimal; currency: string; }
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
        expect(() => runSchema(source, { vendorPrefix: "x-formspec" })).toThrow(/TYPE_MISMATCH/);
      });
    });

    // -----------------------------------------------------------------------
    // Symbol-based registration
    //
    // Symbol-based registration is a separate shape from name / brand: it
    // pairs a `defineCustomType<T>()` type parameter in the config file with
    // the user-visible alias in the source. `generateSchemas` resolves the
    // symbol map via the `configPath` option, so the integration test
    // requires a multi-file fixture (decimal.ts + formspec.config.ts +
    // model.ts). Uses a `typeName` that does NOT match the alias identifier
    // so name-based lookup cannot accidentally satisfy the test.
    // -----------------------------------------------------------------------
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
            '        { tagName: "minimum", constraintName: "DecimalMinimum", parseValue: (raw) => raw.trim() },',
            '        { tagName: "exclusiveMinimum", constraintName: "DecimalExclusiveMinimum", parseValue: (raw) => raw.trim() },',
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
            {
              tagName: "minimum",
              constraintName: "DecimalMinimum",
              parseValue: (raw: string) => raw.trim(),
            },
            {
              tagName: "exclusiveMinimum",
              constraintName: "DecimalExclusiveMinimum",
              parseValue: (raw: string) => raw.trim(),
            },
          ],
          toJsonSchema: () => ({ type: "string" }),
        });
        const extension = defineExtension({
          extensionId: "x-symtest",
          types: [opaqueDecimal],
          // Constraints must be registered for the broadening to complete — the
          // broadening references constraintName and the registry must find the
          // constraint definition to build the constraint node.
          constraints: [
            defineConstraint({
              constraintName: "DecimalMinimum",
              compositionRule: "intersect",
              applicableTypes: ["custom"],
              emitsVocabularyKeywords: true,
              toJsonSchema: (payload) => ({ symDecimalMinimum: payload }),
            }),
            defineConstraint({
              constraintName: "DecimalExclusiveMinimum",
              compositionRule: "intersect",
              applicableTypes: ["custom"],
              emitsVocabularyKeywords: true,
              toJsonSchema: (payload) => ({ symDecimalExclusiveMinimum: payload }),
            }),
          ],
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
        // Pin the broadened keyword + payload rather than just presence — a regression to
        // raw `exclusiveMinimum: 0` emission would otherwise pass the shape-only check.
        const amountSchema = override?.properties?.["amount"] as
          | Record<string, unknown>
          | undefined;
        expect(
          amountSchema?.["symDecimalExclusiveMinimum"],
          "expected broadened vocabulary keyword symDecimalExclusiveMinimum === '0'"
        ).toBe("0");
        expect(
          amountSchema?.["exclusiveMinimum"],
          "raw numeric `exclusiveMinimum` must NOT appear — path broadening regressed"
        ).toBeUndefined();
      });
    });

    // -----------------------------------------------------------------------
    // Mixed direct + path constraints
    //
    // When a field has both a direct constraint and a path-targeted constraint,
    // both must broaden independently.
    // -----------------------------------------------------------------------
    describe("mixed direct and path constraints", () => {
      it("applies both a path-targeted broadened constraint and a custom constraint tag independently", () => {
        // `@exclusiveMinimum :amount 0` broadens to decimalExclusiveMinimum on the amount path.
        // `@maximum :amount 100` broadens to decimalMaximum on the amount path.
        // Both must appear on the same amount segment schema.
        const source = `
          ${nameBasedDecimal}
          export interface MonetaryAmount { amount: VocabDecimal; currency: string; }
          export interface PaymentForm {
            /** @exclusiveMinimum :amount 0 @maximum :amount 100 */
            total: MonetaryAmount;
          }
        `;
        const result = runSchema(source, nameBasedConfig);
        const amountSchema = result.jsonSchema.properties?.["total"]?.properties?.["amount"];
        expect(amountSchema, "expected properties.total.properties.amount").toBeDefined();
        expect(
          (amountSchema as Record<string, unknown>)["decimalExclusiveMinimum"],
          "expected decimalExclusiveMinimum: '0'"
        ).toBe("0");
        expect(
          (amountSchema as Record<string, unknown>)["decimalMaximum"],
          "expected decimalMaximum: '100'"
        ).toBe("100");
      });
    });
  });

  // =========================================================================
  // Path-targeted broadening on string-backed custom types.
  //
  // The `@minLength`, `@maxLength`, and `@pattern` built-in tags must also
  // broadened when the path terminal resolves to a string-backed custom type
  // with broadenings registered (here: `PostalCode`).
  // =========================================================================
  describe("path-targeted broadening on string-backed custom types", () => {
    const postalCodeDecl = `export type PostalCode = string & { readonly __brand: "PostalCode" };`;

    const postalConfig: FormSpecConfig = {
      extensions: [vocabStringExtension],
      vendorPrefix: "x-test",
    };

    function runPostalSchema(source: string) {
      const filePath = writeTempSource(source);
      try {
        return generateSchemas({
          filePath,
          typeName: "DeliveryForm",
          config: postalConfig,
          errorReporting: "throw",
        });
      } finally {
        fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
      }
    }

    it("broadens @minLength through a path target onto a PostalCode subfield", () => {
      // @minLength :code 5 on Envelope.code: PostalCode should emit
      // postalMinLength: "5" (vocabulary keyword, string payload).
      const source = `
        ${postalCodeDecl}
        export interface Envelope { code: PostalCode; name: string; }
        export interface DeliveryForm {
          /** @minLength :code 5 */
          address: Envelope;
        }
      `;
      const result = runPostalSchema(source);
      const codeSchema = result.jsonSchema.properties?.["address"]?.properties?.["code"];
      expect(codeSchema, "expected properties.address.properties.code").toBeDefined();
      expect((codeSchema as Record<string, unknown>)["postalMinLength"]).toBe("5");
    });

    it("broadens @maxLength through a path target onto a PostalCode subfield", () => {
      const source = `
        ${postalCodeDecl}
        export interface Envelope { code: PostalCode; name: string; }
        export interface DeliveryForm {
          /** @maxLength :code 10 */
          address: Envelope;
        }
      `;
      const result = runPostalSchema(source);
      const codeSchema = result.jsonSchema.properties?.["address"]?.properties?.["code"];
      expect((codeSchema as Record<string, unknown>)["postalMaxLength"]).toBe("10");
    });

    it("broadens @pattern through a path target onto a PostalCode subfield", () => {
      // Source-level @pattern arg: ^\d{5}$ — doubled in the source template so it
      // reaches the tag parser as a single backslash before the `d`. Per spec 002,
      // the raw tag text after stripping the leading `:code ` segment is the
      // pattern payload; the fixture's parseValue is `raw.trim()`, so the payload
      // is the exact JSON-Schema-style regex literal.
      const source = `
        ${postalCodeDecl}
        export interface Envelope { code: PostalCode; name: string; }
        export interface DeliveryForm {
          /** @pattern :code ^\\d{5}$ */
          address: Envelope;
        }
      `;
      const result = runPostalSchema(source);
      const codeSchema = result.jsonSchema.properties?.["address"]?.properties?.["code"] as
        | Record<string, unknown>
        | undefined;
      // Pin the exact payload so a payload-mangling regression (e.g. lost
      // backslash, accidental JSON-stringification) is caught.
      expect(codeSchema?.["postalPattern"]).toBe("^\\d{5}$");
      // Raw `pattern` keyword must NOT appear — that would mean broadening regressed.
      expect(codeSchema?.["pattern"]).toBeUndefined();
    });

    it("does not broaden @minimum (numeric) onto a string-backed PostalCode (no registration)", () => {
      // PostalCode has no broadening for `@minimum`, so this must produce a
      // TYPE_MISMATCH — not silent fallthrough, not raw keyword emission.
      const source = `
        ${postalCodeDecl}
        export interface Envelope { code: PostalCode; name: string; }
        export interface DeliveryForm {
          /** @minimum :code 0 */
          address: Envelope;
        }
      `;
      const filePath = writeTempSource(source);
      try {
        expect(() =>
          generateSchemas({
            filePath,
            typeName: "DeliveryForm",
            config: postalConfig,
            errorReporting: "throw",
          })
        ).toThrow(/TYPE_MISMATCH/);
      } finally {
        fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
      }
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
