import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateSchemasFromClass } from "@formspec/build";

const formsPath = path.resolve(import.meta.dirname, "../src/forms.ts");
const schemasDir = path.resolve(import.meta.dirname, "../schemas");

describe("ProductForm schemas", () => {
  const result = generateSchemasFromClass({
    filePath: formsPath,
    className: "ProductForm",
  });

  it("generated JSON Schema matches committed file", () => {
    const committed = JSON.parse(
      fs.readFileSync(path.join(schemasDir, "ProductForm.schema.json"), "utf-8")
    ) as Record<string, unknown>;
    expect(result.jsonSchema).toEqual(committed);
  });

  it("generated uiSchema matches committed file", () => {
    const committed = JSON.parse(
      fs.readFileSync(path.join(schemasDir, "ProductForm.ui.json"), "utf-8")
    ) as { elements: unknown[] };
    expect(result.uiSchema).toEqual(committed);
  });

  it("has required fields", () => {
    expect(result.jsonSchema.required).toContain("name");
    expect(result.jsonSchema.required).toContain("price");
    expect(result.jsonSchema.required).toContain("weight");
    expect(result.jsonSchema.required).toContain("sku");
    expect(result.jsonSchema.required).toContain("stock");
    expect(result.jsonSchema.required).toContain("category");
  });

  it("has optional fields", () => {
    expect(result.jsonSchema.required).not.toContain("batchCode");
    expect(result.jsonSchema.required).not.toContain("expiryDays");
  });

  it("applies TSDoc string constraints (MinLength, MaxLength)", () => {
    const props = result.jsonSchema.properties ?? {};
    expect(props["name"]).toMatchObject({ minLength: 1, maxLength: 200 });
    expect(props["batchCode"]).toMatchObject({ minLength: 5, maxLength: 20 });
  });

  it("applies decorator numeric constraints (Minimum, Maximum)", () => {
    const props = result.jsonSchema.properties ?? {};
    expect(props["price"]).toMatchObject({ minimum: 0, maximum: 99999 });
  });

  it("applies TSDoc numeric constraints including decimals", () => {
    const props = result.jsonSchema.properties ?? {};
    expect(props["weight"]).toMatchObject({ minimum: 0.01, maximum: 1000 });
  });

  it("applies TSDoc pattern constraint", () => {
    const props = result.jsonSchema.properties ?? {};
    expect(props["sku"]).toMatchObject({ pattern: "^[A-Z]{3}-\\d{4}$" });
  });

  it("applies cross-source constraints (decorator + TSDoc on same field)", () => {
    const props = result.jsonSchema.properties ?? {};
    expect(props["stock"]).toMatchObject({
      minimum: 0,
      exclusiveMaximum: 10000,
    });
  });

  it("applies TSDoc constraints on conditional fields", () => {
    const props = result.jsonSchema.properties ?? {};
    expect(props["expiryDays"]).toMatchObject({ minimum: 1, maximum: 365 });
  });

  it("includes group assignments and showWhen rule in uiSchema", () => {
    const elements = result.uiSchema.elements as Array<{
      type: string;
      label?: string;
      elements?: Array<{ type: string; scope?: string; rule?: unknown }>;
    }>;

    // Top-level elements are the three Group nodes in definition order.
    expect(elements.map((el) => ({ type: el.type, label: el.label }))).toEqual([
      { type: "Group", label: "Details" },
      { type: "Group", label: "Inventory" },
      { type: "Group", label: "Shipping" },
    ]);

    // The Shipping group contains expiryDays with a SHOW rule.
    const shippingGroup = elements[2];
    expect(shippingGroup?.type).toBe("Group");
    expect(shippingGroup?.label).toBe("Shipping");

    const expiryControl = shippingGroup?.elements?.find(
      (el) => el.scope === "#/properties/expiryDays"
    );
    expect(expiryControl).toMatchObject({
      type: "Control",
      scope: "#/properties/expiryDays",
      rule: {
        effect: "SHOW",
        condition: { scope: "#/properties/category", schema: { const: "food" } },
      },
    });
  });
});
