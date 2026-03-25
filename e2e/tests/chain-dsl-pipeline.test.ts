import { describe, it, expect } from "vitest";
import { buildFormSchemas } from "@formspec/build";
import { ContactForm } from "../fixtures/chain-dsl/contact-form.js";
import {
  assertValidJsonSchema,
  assertPropertyConstraints,
} from "../helpers/schema-assertions.js";

describe("Chain DSL Pipeline", () => {
  const { jsonSchema, uiSchema } = buildFormSchemas(ContactForm);
  const schema = jsonSchema as Record<string, unknown>;
  const ui = uiSchema as Record<string, unknown>;

  describe("JSON Schema", () => {
    it("produces a valid object schema", () => {
      assertValidJsonSchema(schema);
    });

    it("has correct required fields", () => {
      expect(schema["required"]).toContain("firstName");
      expect(schema["required"]).toContain("lastName");
      expect(schema["required"]).toContain("contactMethod");
    });

    it("has age with min/max constraints", () => {
      assertPropertyConstraints(schema, "age", {
        minimum: 0,
        maximum: 150,
      });
    });

    it("has contactMethod enum values", () => {
      assertPropertyConstraints(schema, "contactMethod", {
        enum: ["email", "phone", "mail"],
      });
    });

    it("has all expected properties", () => {
      const props = Object.keys((schema["properties"] as Record<string, unknown> | undefined) ?? {});
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
      expect(ui).toHaveProperty("elements");
      const elements = ui["elements"] as unknown[];
      expect(elements.length).toBeGreaterThan(0);
    });
  });
});
