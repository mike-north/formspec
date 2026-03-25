import { describe, it, expect } from "vitest";
import { buildFormSchemas } from "@formspec/build";
import { ContactForm } from "../fixtures/chain-dsl/contact-form.js";
import {
  assertValidJsonSchema,
  assertPropertyConstraints,
} from "../helpers/schema-assertions.js";

describe("Chain DSL Pipeline", () => {
  const result = buildFormSchemas(ContactForm);
  const { jsonSchema, uiSchema } = result;

  describe("JSON Schema", () => {
    it("produces a valid object schema", () => {
      assertValidJsonSchema(jsonSchema as Record<string, unknown>);
    });

    it("has correct required fields", () => {
      expect(jsonSchema.required).toContain("firstName");
      expect(jsonSchema.required).toContain("lastName");
      expect(jsonSchema.required).toContain("contactMethod");
    });

    it("has age with min/max constraints", () => {
      assertPropertyConstraints(jsonSchema as Record<string, unknown>, "age", {
        minimum: 0,
        maximum: 150,
      });
    });

    it("has contactMethod enum values", () => {
      assertPropertyConstraints(jsonSchema as Record<string, unknown>, "contactMethod", {
        enum: ["email", "phone", "mail"],
      });
    });

    it("has all expected properties", () => {
      const props = Object.keys(jsonSchema.properties ?? {});
      expect(props).toContain("firstName");
      expect(props).toContain("lastName");
      expect(props).toContain("email");
      expect(props).toContain("contactMethod");
      expect(props).toContain("phoneNumber");
      expect(props).toContain("age");
      expect(props).toContain("newsletter");
    });
  });

  describe("UI Schema", () => {
    it("has group elements", () => {
      expect(uiSchema).toHaveProperty("elements");
      const elements = (uiSchema as { elements: unknown[] }).elements;
      expect(elements.length).toBeGreaterThan(0);
    });
  });

});
