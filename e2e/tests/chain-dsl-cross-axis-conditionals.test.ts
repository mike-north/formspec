import { describe, it, expect } from "vitest";
import { buildFormSchemas } from "@formspec/build";
import { CrossAxisConditionalForm } from "../fixtures/chain-dsl/cross-axis-conditional-form.js";
import { assertUiSchemaRule, assertValidJsonSchema } from "../helpers/schema-assertions.js";

describe("Chain DSL Cross-Axis Conditionals", () => {
  const { jsonSchema, uiSchema } = buildFormSchemas(CrossAxisConditionalForm);
  const schema = jsonSchema as Record<string, unknown>;
  const ui = uiSchema as Record<string, unknown>;

  describe("JSON Schema", () => {
    it("produces a valid object schema", () => {
      assertValidJsonSchema(schema);
    });

    it("includes every axis field in the schema", () => {
      const properties = schema["properties"] as Record<string, Record<string, unknown>>;
      expect(properties).toHaveProperty("country");
      expect(properties).toHaveProperty("paymentMethod");
      expect(properties).toHaveProperty("accountType");
      expect(properties).toHaveProperty("routingNumber");
    });

    it("keeps all conditional fields in the required array", () => {
      const required = schema["required"] as string[];
      expect(required).toContain("country");
      expect(required).toContain("paymentMethod");
      expect(required).toContain("accountType");
    });
  });

  describe("UI Schema", () => {
    it("flattens all conditional axes into one SHOW rule", () => {
      assertUiSchemaRule(ui, "#/properties/routingNumber", "SHOW", {
        scope: "#",
        schema: {
          allOf: [
            { properties: { country: { const: "US" } } },
            { properties: { paymentMethod: { const: "bank" } } },
            { properties: { accountType: { const: "checking" } } },
          ],
        },
      });
    });
  });
});
