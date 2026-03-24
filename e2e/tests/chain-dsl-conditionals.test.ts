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
  loadExpected,
} from "../helpers/schema-assertions.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Chain DSL Conditionals", () => {
  const result = buildFormSchemas(ConditionalForm);
  const { jsonSchema, uiSchema } = result;
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

    // 001-canonical-ir.md: "A conditional field is optional (may be absent) even
    // when the condition is met (C3, S8)."
    // BUG: Currently cardNumber and accountNumber leak into the top-level required
    // array unconditionally. A paymentMethod=crypto submission would fail validation.
    it.fails("C3/S8: conditional fields are NOT in top-level required (cardNumber)", () => {
      expect(required).not.toContain("cardNumber");
    });

    it.fails("C3/S8: conditional fields are NOT in top-level required (accountNumber)", () => {
      expect(required).not.toContain("accountNumber");
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

  describe("Gold-master comparison", () => {
    const expectedDir = path.resolve(__dirname, "..", "expected", "chain-dsl");

    it("matches expected JSON Schema", () => {
      expect(fs.existsSync(path.join(expectedDir, "conditional-form.schema.json"))).toBe(true);
      const expected = loadExpected("chain-dsl/conditional-form.schema.json");
      expect(jsonSchema).toEqual(expected);
    });

    it("matches expected UI Schema", () => {
      expect(fs.existsSync(path.join(expectedDir, "conditional-form.uischema.json"))).toBe(true);
      const expected = loadExpected("chain-dsl/conditional-form.uischema.json");
      expect(uiSchema).toEqual(expected);
    });
  });
});
