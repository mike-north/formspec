/**
 * @see 000-principles.md — C3: "Conditionals affect visibility, not schema membership"
 * @see 001-canonical-ir.md — "A conditional field is optional (may be absent) even when
 *   the condition is met (C3, S8)."
 * @see 003-json-schema-vocabulary.md — UI Schema rule structure
 */
import { describe, it, expect } from "vitest";
import { buildFormSchemas } from "@formspec/build";
import { ConditionalForm } from "../fixtures/chain-dsl/conditional-form.js";
import {
  assertValidJsonSchema,
  assertUiSchemaRule,
  findUiElement,
} from "../helpers/schema-assertions.js";

describe("Chain DSL Conditionals", () => {
  const { jsonSchema, uiSchema } = buildFormSchemas(ConditionalForm);
  const schema = jsonSchema as Record<string, unknown>;
  const properties = schema["properties"] as Record<string, Record<string, unknown>>;
  const required = schema["required"] as string[];
  const ui = uiSchema as Record<string, unknown>;

  describe("JSON Schema", () => {
    it("produces a valid object schema", () => {
      assertValidJsonSchema(schema);
    });

    // C3: "A field wrapped in when() is always present in the JSON Schema."
    it("C3: ALL fields present in schema regardless of conditionals", () => {
      expect(properties).toHaveProperty("paymentMethod");
      expect(properties).toHaveProperty("cardNumber");
      expect(properties).toHaveProperty("expiryDate");
      expect(properties).toHaveProperty("accountNumber");
      expect(properties).toHaveProperty("routingNumber");
      expect(properties).toHaveProperty("savePaymentMethod");
    });

    it("unconditional required field: paymentMethod is in required array", () => {
      expect(required).toContain("paymentMethod");
    });

    it("paymentMethod has correct enum values", () => {
      expect(properties["paymentMethod"]["enum"]).toEqual(["card", "bank_transfer", "crypto"]);
    });

    // C3 / #512: a field marked required: true inside a when() block is present in
    // the schema (asserted above) but is NOT in the top-level required array — the
    // condition may be false, so the field may be absent. This matches the inferred
    // TypeScript type, where conditional fields are optional. The UI SHOW rules
    // handle conditional visibility.
    it("C3: conditional required field is excluded from top-level required (cardNumber)", () => {
      expect(required).not.toContain("cardNumber");
    });

    it("C3: conditional required field is excluded from top-level required (accountNumber)", () => {
      expect(required).not.toContain("accountNumber");
    });

    // The only unconditional required field is paymentMethod, so it is the sole
    // entry in the root required array.
    it("C3: root required contains only the unconditional required field", () => {
      expect(required).toEqual(["paymentMethod"]);
    });

    it("unconditional optional fields are absent from required", () => {
      expect(required).not.toContain("expiryDate");
      expect(required).not.toContain("routingNumber");
      expect(required).not.toContain("savePaymentMethod");
    });
  });

  describe("UI Schema", () => {
    // 003: Conditional visibility via JSON Forms SHOW rules
    it("card fields have SHOW rule for paymentMethod=card", () => {
      assertUiSchemaRule(ui, "#/properties/cardNumber", "SHOW", {
        scope: "#/properties/paymentMethod",
        schema: { const: "card" },
      });
      assertUiSchemaRule(ui, "#/properties/expiryDate", "SHOW", {
        scope: "#/properties/paymentMethod",
        schema: { const: "card" },
      });
    });

    it("bank_transfer fields have SHOW rule for paymentMethod=bank_transfer", () => {
      assertUiSchemaRule(ui, "#/properties/accountNumber", "SHOW", {
        scope: "#/properties/paymentMethod",
        schema: { const: "bank_transfer" },
      });
      assertUiSchemaRule(ui, "#/properties/routingNumber", "SHOW", {
        scope: "#/properties/paymentMethod",
        schema: { const: "bank_transfer" },
      });
    });

    it("unconditional savePaymentMethod has no rule", () => {
      const element = findUiElement(ui, "#/properties/savePaymentMethod");
      expect(element).toBeDefined();
      if (element) {
        expect(element["rule"]).toBeUndefined();
      }
    });
  });
});
