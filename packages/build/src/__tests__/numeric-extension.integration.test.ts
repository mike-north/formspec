import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { generateSchemas, type GenerateSchemasOptions } from "../generators/class-schema.js";
import {
  addDecimal,
  compareDecimal,
  createNumericExtensionRegistry,
  formatDecimal,
  parseDecimal,
  subtractDecimal,
} from "./fixtures/example-numeric-extension.js";

interface NullableSchema {
  readonly oneOf?: readonly unknown[];
  readonly ["x-formspec-max-decimal-places"]?: unknown;
  readonly ["x-formspec-decimal-minimum"]?: unknown;
}

function generateSchemasOrThrow(options: Omit<GenerateSchemasOptions, "errorReporting">) {
  return generateSchemas({
    ...options,
    errorReporting: "throw",
  });
}

function writeTempSource(source: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-numeric-ext-"));
  const filePath = path.join(dir, "model.ts");
  fs.writeFileSync(filePath, source);
  return filePath;
}

describe("numeric extension integration", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("generates correct schemas when a custom type is imported and other fields have constraint tags", () => {
    // Regression: before the fix, when Decimal was imported (not defined inline),
    // buildSupportingDeclarations would filter out the host interface declaration
    // (because it referenced the imported name Decimal), causing the synthetic
    // checker to fail to resolve the host type and emit spurious TYPE_MISMATCH errors.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-numeric-ext-import-"));
    tempDirs.push(dir);

    fs.writeFileSync(path.join(dir, "decimal.ts"), "export type Decimal = string;\n");

    const filePath = path.join(dir, "config.ts");
    fs.writeFileSync(
      filePath,
      [
        'import type { Decimal } from "./decimal.js";',
        "",
        "export interface MixedConfig {",
        "  /** @minimum 0 */",
        "  amount: Decimal;",
        "",
        "  /** @minLength 1 */",
        "  label: string;",
        "}",
      ].join("\n")
    );

    const { jsonSchema } = generateSchemasOrThrow({
      filePath,
      typeName: "MixedConfig",
      extensionRegistry: createNumericExtensionRegistry(),
      vendorPrefix: "x-formspec",
    });

    expect(jsonSchema.properties?.["amount"]).toEqual({
      type: "string",
      "x-formspec-decimal": true,
      "x-formspec-decimal-minimum": "0.0",
    });
    expect(jsonSchema.properties?.["label"]).toEqual({
      type: "string",
      minLength: 1,
    });
  });

  it("parses, formats, compares, adds, and subtracts Decimal values", () => {
    const left = parseDecimal("12.50");
    const right = parseDecimal("0.25");

    expect(formatDecimal(left)).toBe("12.50");
    expect(formatDecimal(parseDecimal("12"))).toBe("12.0");
    expect(compareDecimal(left, right)).toBe(1);
    expect(formatDecimal(addDecimal(left, right))).toBe("12.75");
    expect(formatDecimal(subtractDecimal(left, right))).toBe("12.25");
  });

  it("handles negative, zero, and invalid Decimal literals", () => {
    expect(formatDecimal(parseDecimal("-3.50"))).toBe("-3.50");
    expect(formatDecimal(parseDecimal("0"))).toBe("0.0");
    expect(() => parseDecimal("   ")).toThrow(/Invalid decimal literal/);
    expect(() => parseDecimal("12.3.4")).toThrow(/Invalid decimal literal/);
  });

  it("generates JSON Schema and UI Schema through the public class-generation API", () => {
    const filePath = writeTempSource(`
      export type Decimal = string;
      export type Money = Decimal;
      export type MoneyList = Money[];

      export interface Invoice {
        /**
         * @minimum 0
         * @exclusiveMaximum 9999.99
         * @multipleOf 0.01
         * @maxDecimalPlaces 2
         * @maxSigFig 6
         * @displayName Invoice Amount
         */
        amount: Decimal;

        /** @maxDecimalPlaces 2 */
        nullableAmount: Money | null;

        /** @minimum 1.50 */
        nullableMinimumAmount: Money | null;

        /** @maxDecimalPlaces 4 */
        amounts: MoneyList;

        /** @minimum 1.0 @maxSigFig 7 */
        net: Money;

        /** @maxSigFig 8 */
        count: bigint;

        /** @maxDecimalPlaces 3 @maxSigFig 5 */
        ratio: number;
      }
    `);
    tempDirs.push(path.dirname(filePath));

    const { jsonSchema, uiSchema } = generateSchemasOrThrow({
      filePath,
      typeName: "Invoice",
      extensionRegistry: createNumericExtensionRegistry(),
      vendorPrefix: "x-formspec",
    });

    expect(jsonSchema.properties?.["amount"]).toEqual({
      type: "string",
      "x-formspec-decimal": true,
      "x-formspec-decimal-minimum": "0.0",
      "x-formspec-decimal-exclusive-maximum": "9999.99",
      "x-formspec-decimal-multiple-of": "0.01",
      "x-formspec-max-decimal-places": 2,
      "x-formspec-max-sig-fig": 6,
      title: "Invoice Amount",
    });

    expect(jsonSchema.properties?.["count"]).toEqual({
      type: "string",
      "x-formspec-bigint": true,
      "x-formspec-max-sig-fig": 8,
    });

    const nullableAmountSchema = jsonSchema.properties?.["nullableAmount"] as
      | NullableSchema
      | undefined;
    expect(nullableAmountSchema?.["x-formspec-max-decimal-places"]).toBe(2);
    expect(nullableAmountSchema?.oneOf).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "string",
          "x-formspec-decimal": true,
        }),
        expect.objectContaining({ type: "null" }),
      ])
    );

    const nullableMinimumAmountSchema = jsonSchema.properties?.["nullableMinimumAmount"] as
      | NullableSchema
      | undefined;
    expect(nullableMinimumAmountSchema?.["x-formspec-decimal-minimum"]).toBe("1.50");
    expect(nullableMinimumAmountSchema?.oneOf).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "string",
          "x-formspec-decimal": true,
        }),
        expect.objectContaining({ type: "null" }),
      ])
    );

    expect(jsonSchema.properties?.["amounts"]).toEqual({
      type: "array",
      "x-formspec-max-decimal-places": 4,
      items: {
        type: "string",
        "x-formspec-decimal": true,
      },
    });

    expect(jsonSchema.properties?.["net"]).toEqual({
      type: "string",
      "x-formspec-decimal": true,
      "x-formspec-decimal-minimum": "1.0",
      "x-formspec-max-sig-fig": 7,
    });

    expect(jsonSchema.properties?.["ratio"]).toEqual({
      type: "number",
      "x-formspec-max-decimal-places": 3,
      "x-formspec-max-sig-fig": 5,
    });

    expect(uiSchema).toMatchObject({
      type: "VerticalLayout",
      elements: [
        { type: "Control", scope: "#/properties/amount", label: "Invoice Amount" },
        { type: "Control", scope: "#/properties/nullableAmount" },
        { type: "Control", scope: "#/properties/nullableMinimumAmount" },
        { type: "Control", scope: "#/properties/amounts" },
        { type: "Control", scope: "#/properties/net" },
        { type: "Control", scope: "#/properties/count" },
        { type: "Control", scope: "#/properties/ratio" },
      ],
    });
  });
});
