import { describe, it, expect } from "vitest";
import { buildFormSchemas } from "@formspec/build";
import { ContactForm } from "../fixtures/chain-dsl/contact-form.js";
import {
  assertValidJsonSchema,
  assertPropertyConstraints,
  loadExpected,
} from "../helpers/schema-assertions.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  describe("Gold-master comparison", () => {
    const expectedDir = path.resolve(__dirname, "..", "expected", "chain-dsl");

    it("matches expected JSON Schema", () => {
      expect(fs.existsSync(path.join(expectedDir, "contact-form.schema.json"))).toBe(true);
      const expected = loadExpected("chain-dsl/contact-form.schema.json");
      expect(jsonSchema).toEqual(expected);
    });

    it("matches expected UI Schema", () => {
      expect(fs.existsSync(path.join(expectedDir, "contact-form.uischema.json"))).toBe(true);
      const expected = loadExpected("chain-dsl/contact-form.uischema.json");
      expect(uiSchema).toEqual(expected);
    });
  });
});
