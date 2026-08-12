/**
 * Implicit sub-field routing for bare built-in constraints.
 *
 * When a built-in constraint tag is written WITHOUT a path target on an
 * object-typed field, and exactly one direct sub-field could accept it, the
 * constraint is routed to that sub-field — so `@minimum 0` on a
 * `MonetaryAmount { amount: Decimal; currency: string }` field behaves like
 * `@minimum :amount 0`. Routing is skipped when it would be ambiguous (more
 * than one candidate sub-field) or when the field itself already accepts the
 * constraint.
 *
 * Reuses the name-based Decimal vocabulary fixture (broadens `@minimum` →
 * `decimalMinimum`) so assertions can pin the broadened keyword directly.
 */

import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { FormSpecConfig } from "@formspec/config";
import { type ClassSchemas, generateSchemas } from "../src/generators/class-schema.js";
import { vocabDecimalByNameExtension } from "./fixtures/example-vocabulary-decimal-extension.js";

const config: FormSpecConfig = {
  extensions: [vocabDecimalByNameExtension],
  vendorPrefix: "x-formspec",
};

const NAME_DECIMAL_DECL = `export type Decimal = string & { readonly __brand: "Decimal" };`;
const MONETARY_AMOUNT_DECL =
  "export interface MonetaryAmount { amount: Decimal; currency: string; }";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function runSchema(source: string): ClassSchemas {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-implicit-route-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "model.ts");
  fs.writeFileSync(filePath, source);
  return generateSchemas({ filePath, typeName: "Root", config, errorReporting: "throw" });
}

function fieldSchema(
  result: ClassSchemas,
  field: string
): Record<string, unknown> | undefined {
  return result.jsonSchema.properties?.[field] as Record<string, unknown> | undefined;
}

function subSchema(
  result: ClassSchemas,
  field: string,
  sub: string
): Record<string, unknown> | undefined {
  const props = fieldSchema(result, field)?.["properties"] as Record<string, unknown> | undefined;
  return props?.[sub] as Record<string, unknown> | undefined;
}

describe("implicit sub-field routing for bare built-in constraints", () => {
  it("routes a bare @minimum on MonetaryAmount to its sole numeric sub-field (amount)", () => {
    const source = [
      NAME_DECIMAL_DECL,
      MONETARY_AMOUNT_DECL,
      "export interface Root {",
      "  /** @minimum 0 */",
      "  total: MonetaryAmount;",
      "}",
    ].join("\n");

    const result = runSchema(source);

    const amount = subSchema(result, "total", "amount");
    expect(amount, "expected amount sub-schema").toBeDefined();
    expect(amount?.["decimalMinimum"]).toBe("0");

    // Must not leak onto the field itself.
    const field = fieldSchema(result, "total");
    expect(field?.["decimalMinimum"]).toBeUndefined();
    expect(field?.["minimum"]).toBeUndefined();
  });

  it("bare @minimum produces the same amount sub-schema as explicit @minimum :amount", () => {
    const bareSource = [
      NAME_DECIMAL_DECL,
      MONETARY_AMOUNT_DECL,
      "export interface Root {",
      "  /** @minimum 0 */",
      "  total: MonetaryAmount;",
      "}",
    ].join("\n");
    const explicitSource = [
      NAME_DECIMAL_DECL,
      MONETARY_AMOUNT_DECL,
      "export interface Root {",
      "  /** @minimum :amount 0 */",
      "  total: MonetaryAmount;",
      "}",
    ].join("\n");

    const bare = subSchema(runSchema(bareSource), "total", "amount");
    const explicit = subSchema(runSchema(explicitSource), "total", "amount");
    expect(bare).toEqual(explicit);
  });

  it("routes multiple bare bounds (@minimum + @maximum) to amount", () => {
    const source = [
      NAME_DECIMAL_DECL,
      MONETARY_AMOUNT_DECL,
      "export interface Root {",
      "  /**",
      "   * @minimum 0",
      "   * @maximum 9999.99",
      "   */",
      "  total: MonetaryAmount;",
      "}",
    ].join("\n");

    const amount = subSchema(runSchema(source), "total", "amount");
    expect(amount?.["decimalMinimum"]).toBe("0");
    expect(amount?.["decimalMaximum"]).toBe("9999.99");
  });

  it("does NOT route when the object has more than one candidate sub-field (ambiguous)", () => {
    // Both `amount` (broadened Decimal) and `count` (native number) could accept
    // @minimum, so routing is ambiguous and the bare constraint stays a mismatch.
    const source = [
      NAME_DECIMAL_DECL,
      "export interface Pair { amount: Decimal; count: number; }",
      "export interface Root {",
      "  /** @minimum 0 */",
      "  pair: Pair;",
      "}",
    ].join("\n");

    expect(() => runSchema(source)).toThrow(/TYPE_MISMATCH|only valid on number/);
  });

  it("does not reroute when the field itself already accepts the constraint (Decimal field)", () => {
    const source = [
      NAME_DECIMAL_DECL,
      "export interface Root {",
      "  /** @minimum 0 */",
      "  price: Decimal;",
      "}",
    ].join("\n");

    const result = runSchema(source);
    const field = fieldSchema(result, "price");
    expect(field?.["decimalMinimum"]).toBe("0");
  });
});
