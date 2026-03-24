/**
 * @see 000-principles.md — C2: "Schema shape is never altered for presentation"
 * @see 000-principles.md — C4: "Object fields create data nesting"
 * @see 003-json-schema-vocabulary.md — §2.4 arrays (minItems, maxItems), §2.5 nested objects
 */
import { describe, it, expect } from "vitest";
import { buildFormSchemas } from "@formspec/build";
import { NestedForm } from "../fixtures/chain-dsl/nested-form.js";
import {
  assertValidJsonSchema,
  assertNestedProperty,
  loadExpected,
} from "../helpers/schema-assertions.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Chain DSL Nesting", () => {
  const result = buildFormSchemas(NestedForm);
  const { jsonSchema, uiSchema } = result;
  const schema = jsonSchema as Record<string, unknown>;
  const properties = schema["properties"] as Record<string, Record<string, unknown>>;

  describe("JSON Schema", () => {
    it("produces a valid object schema", () => {
      assertValidJsonSchema(schema);
    });

    // C2: "A group() element affects UI layout only — it does not create a new scope,
    // namespace, or nesting level in the data schema."
    it("C2: group does NOT create schema nesting — customerName is at root", () => {
      expect(properties).toHaveProperty("customerName");
      expect(properties).not.toHaveProperty("billing");
      expect(properties).not.toHaveProperty("Billing");
    });

    // C4: "field.object() creates a nested object in the schema."
    it("C4: billingAddress creates nested properties", () => {
      expect(properties).toHaveProperty("billingAddress");
      const billing = properties["billingAddress"];
      expect(billing["type"]).toBe("object");
      const billingProps = billing["properties"] as Record<string, Record<string, unknown>>;
      expect(billingProps).toHaveProperty("street");
      expect(billingProps).toHaveProperty("city");
      expect(billingProps).toHaveProperty("zip");
    });

    it("C4: shippingAddress creates nested properties", () => {
      assertNestedProperty(schema, "shippingAddress.street", { type: "string" });
      assertNestedProperty(schema, "shippingAddress.city", { type: "string" });
      assertNestedProperty(schema, "shippingAddress.zip", { type: "string" });
    });

    // 003: "Object with known properties → { type: object, properties: {...}, required: [...] }"
    it("nested objects have their own required arrays", () => {
      const billing = properties["billingAddress"];
      expect(billing["required"]).toEqual(expect.arrayContaining(["street", "city"]));
      expect(billing["required"]).not.toContain("zip");
    });

    // 003 §B4: "additionalProperties is NOT set to false by default"
    it("nested objects do not set additionalProperties: false by default", () => {
      const billing = properties["billingAddress"];
      expect(billing["additionalProperties"]).toBeUndefined();

      const shipping = properties["shippingAddress"];
      expect(shipping["additionalProperties"]).toBeUndefined();
    });

    // 003 §2.4: "T[] → { type: array, items: <T schema> }"
    it("lineItems creates array with object items", () => {
      const lineItems = properties["lineItems"];
      expect(lineItems["type"]).toBe("array");
      const items = lineItems["items"] as Record<string, unknown>;
      expect(items["type"]).toBe("object");
      const itemProps = items["properties"] as Record<string, Record<string, unknown>>;
      expect(itemProps).toHaveProperty("description");
      expect(itemProps).toHaveProperty("quantity");
      expect(itemProps).toHaveProperty("unitPrice");
    });

    // 003 §2.4: "minItems constraint → minItems: n"
    it("lineItems has minItems and maxItems", () => {
      const lineItems = properties["lineItems"];
      expect(lineItems["minItems"]).toBe(1);
      expect(lineItems["maxItems"]).toBe(100);
    });

    it("number fields inside array items have minimum/maximum", () => {
      const lineItems = properties["lineItems"];
      const items = lineItems["items"] as Record<string, unknown>;
      const itemProps = items["properties"] as Record<string, Record<string, unknown>>;
      expect(itemProps["quantity"]["minimum"]).toBe(1);
      expect(itemProps["quantity"]["maximum"]).toBe(9999);
      expect(itemProps["unitPrice"]["minimum"]).toBe(0);
    });

    it("has correct required fields at root level", () => {
      const required = schema["required"] as string[];
      expect(required).toContain("customerName");
      expect(required).toContain("billingAddress");
      expect(required).toContain("lineItems");
      expect(required).not.toContain("shippingAddress");
    });
  });

  describe("UI Schema", () => {
    const ui = uiSchema as Record<string, unknown>;
    const elements = ui["elements"] as Record<string, unknown>[];

    // C2: group is UI-only → should appear in UI Schema as Group element
    it("has a Group element for Billing", () => {
      const billingGroup = elements.find(
        (el) => el["type"] === "Group" && el["label"] === "Billing"
      );
      expect(billingGroup).toBeDefined();
    });

    it("Billing group contains customerName control and billingAddress group", () => {
      const billingGroup = elements.find(
        (el) => el["type"] === "Group" && el["label"] === "Billing"
      );
      expect(billingGroup).toBeDefined();
      if (!billingGroup) return;
      const groupElements = billingGroup["elements"] as Record<string, unknown>[];
      // customerName is a Control
      const customerControl = groupElements.find(
        (el) => el["scope"] === "#/properties/customerName"
      );
      expect(customerControl).toBeDefined();
      // billingAddress is now a Group with nested controls
      const addressGroup = groupElements.find(
        (el) => el["type"] === "Group" && el["label"] === "Billing Address"
      );
      expect(addressGroup).toBeDefined();
    });

    it("has scope paths for nested object fields and arrays", () => {
      const allScopes = collectScopes(ui);
      expect(allScopes).toContain("#/properties/billingAddress/properties/street");
      expect(allScopes).toContain("#/properties/shippingAddress/properties/street");
      expect(allScopes).toContain("#/properties/lineItems");
    });

    it("billingAddress has sub-elements for child fields", () => {
      const billingGroup = elements.find(
        (el) => el["type"] === "Group" && el["label"] === "Billing"
      );
      expect(billingGroup).toBeDefined();
      if (!billingGroup) return;
      const groupElements = billingGroup["elements"] as Record<string, unknown>[];
      const addressGroup = groupElements.find(
        (el) => el["type"] === "Group" && el["label"] === "Billing Address"
      );
      expect(addressGroup).toBeDefined();
      if (!addressGroup) return;
      const subElements = addressGroup["elements"] as Record<string, unknown>[];
      expect(subElements).toBeDefined();
      expect(subElements.length).toBeGreaterThan(0);
    });
  });

  describe("Gold-master comparison", () => {
    const expectedDir = path.resolve(__dirname, "..", "expected", "chain-dsl");

    it("matches expected JSON Schema", () => {
      expect(fs.existsSync(path.join(expectedDir, "nested-form.schema.json"))).toBe(true);
      const expected = loadExpected("chain-dsl/nested-form.schema.json");
      expect(jsonSchema).toEqual(expected);
    });

    it("matches expected UI Schema", () => {
      expect(fs.existsSync(path.join(expectedDir, "nested-form.uischema.json"))).toBe(true);
      const expected = loadExpected("chain-dsl/nested-form.uischema.json");
      expect(uiSchema).toEqual(expected);
    });
  });
});

/** Recursively collect all scope values from a UI Schema tree. */
function collectScopes(node: Record<string, unknown>): string[] {
  const scopes: string[] = [];
  if (typeof node["scope"] === "string") scopes.push(node["scope"]);
  const elements = node["elements"] as Record<string, unknown>[] | undefined;
  if (elements) {
    for (const el of elements) {
      scopes.push(...collectScopes(el));
    }
  }
  return scopes;
}
