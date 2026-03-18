import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateSchemasFromClass } from "@formspec/build";
import type { ExtendedJSONSchema7 } from "@formspec/build";

const formsPath = path.resolve(import.meta.dirname, "../src/forms.ts");
const schemasDir = path.resolve(import.meta.dirname, "../schemas");

describe("OrderForm schemas", () => {
  const result = generateSchemasFromClass({
    filePath: formsPath,
    className: "OrderForm",
  });

  it("generated JSON Schema matches committed file", () => {
    const committed = JSON.parse(
      fs.readFileSync(path.join(schemasDir, "OrderForm.schema.json"), "utf-8")
    ) as ExtendedJSONSchema7;
    expect(result.jsonSchema).toEqual(committed);
  });

  it("generated uiSchema matches committed file", () => {
    const committed = JSON.parse(
      fs.readFileSync(path.join(schemasDir, "OrderForm.ui.json"), "utf-8")
    ) as { elements: unknown[] };
    expect(result.uiSchema).toEqual(committed);
  });

  it("has required fields", () => {
    expect(result.jsonSchema.required).toContain("customerName");
    expect(result.jsonSchema.required).toContain("customerEmail");
    expect(result.jsonSchema.required).toContain("quantity");
    expect(result.jsonSchema.required).toContain("unitPrice");
    expect(result.jsonSchema.required).toContain("priority");
    expect(result.jsonSchema.required).toContain("shippingMethod");
  });

  it("has optional fields", () => {
    expect(result.jsonSchema.required).not.toContain("expressInstructions");
    expect(result.jsonSchema.required).not.toContain("discountCode");
  });

  it("applies extended decorator constraints as built-in equivalents", () => {
    const props = result.jsonSchema.properties ?? {};
    // BoundedMin/BoundedMax should map to minimum/maximum
    expect(props["quantity"]).toMatchObject({ minimum: 1, maximum: 999 });
    expect(props["unitPrice"]).toMatchObject({ minimum: 0, maximum: 99999 });
  });

  it("applies StrictField displayName as title", () => {
    const props = result.jsonSchema.properties ?? {};
    expect(props["customerName"]).toHaveProperty("title", "Customer Name");
    expect(props["quantity"]).toHaveProperty("title", "Quantity");
  });

  it("applies enum values from EnumOptions", () => {
    const props = result.jsonSchema.properties ?? {};
    expect(props["priority"]).toHaveProperty("enum");
    expect(props["shippingMethod"]).toHaveProperty("enum");
  });

  it("includes showWhen in uiSchema", () => {
    const expressField = result.uiSchema.elements.find((e) => e.id === "expressInstructions");
    expect(expressField?.showWhen).toEqual({ field: "shippingMethod", value: "express" });
  });

  it("does not include x-formspec extensions (extended decorators are not custom)", () => {
    const props = result.jsonSchema.properties ?? {};
    for (const key of Object.keys(props)) {
      const prop = props[key] as Record<string, unknown> | undefined;
      const extensionKeys = Object.keys(prop ?? {}).filter((k) => k.startsWith("x-formspec-"));
      expect(extensionKeys).toEqual([]);
    }
  });
});
