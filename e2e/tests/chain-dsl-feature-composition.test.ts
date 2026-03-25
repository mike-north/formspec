/**
 * E2E tests for Chain DSL feature composition parity with TSDoc surface.
 *
 * Verifies that features expressible in both the chain DSL and TSDoc surface
 * produce equivalent JSON Schema output. Not all TSDoc features have chain DSL
 * equivalents — this test covers the intersection:
 *   - Text field with label + minLength + maxLength (parity: @displayName + @minLength + @maxLength)
 *   - Number field with min + max + multipleOf (parity: @minimum + @maximum + @multipleOf)
 *   - Array field with minItems + maxItems (parity: @minItems + @maxItems)
 *
 * TSDoc-only features not tested here: @deprecated, @description,
 * @exclusiveMinimum, @exclusiveMaximum, path-targeted constraints.
 *
 * @see 003-json-schema-vocabulary.md §2.6 (numeric constraints), §2.7 (string constraints)
 * @see 003-json-schema-vocabulary.md §2.4 (arrays with minItems/maxItems)
 * @see 006-parity-testing.md
 */
import { describe, it, expect } from "vitest";
import { buildFormSchemas } from "@formspec/build";
import { FeatureCompositionForm } from "../fixtures/chain-dsl/feature-composition.js";
import { assertValidJsonSchema, loadExpected } from "../helpers/schema-assertions.js";

describe("Chain DSL Feature Composition", () => {
  const result = buildFormSchemas(FeatureCompositionForm);
  const { jsonSchema, uiSchema } = result;
  const schema = jsonSchema as Record<string, unknown>;
  const properties = schema["properties"] as Record<string, Record<string, unknown>>;

  describe("JSON Schema", () => {
    it("produces a valid object schema", () => {
      assertValidJsonSchema(schema);
    });

    // spec 003 §2.7 + §2.8: text field with label + minLength + maxLength combined
    describe("name field — label + minLength + maxLength", () => {
      it("has string type", () => {
        expect(properties["name"]?.["type"]).toBe("string");
      });

      it("has label → title (spec 003 §2.8)", () => {
        expect(properties["name"]?.["title"]).toBe("Full Name");
      });

      it("has minLength constraint (spec 003 §2.7)", () => {
        expect(properties["name"]?.["minLength"]).toBe(1);
      });

      it("has maxLength constraint (spec 003 §2.7)", () => {
        expect(properties["name"]?.["maxLength"]).toBe(200);
      });

      it("all three (title, minLength, maxLength) are present simultaneously", () => {
        const name = properties["name"];
        expect(name).toHaveProperty("title", "Full Name");
        expect(name).toHaveProperty("minLength", 1);
        expect(name).toHaveProperty("maxLength", 200);
      });
    });

    // spec 003 §2.6: number field with min + max + multipleOf combined
    describe("preciseScore field — min + max + multipleOf", () => {
      it("has number type", () => {
        expect(properties["preciseScore"]?.["type"]).toBe("number");
      });

      it("has minimum constraint (spec 003 §2.6)", () => {
        expect(properties["preciseScore"]?.["minimum"]).toBe(0);
      });

      it("has maximum constraint (spec 003 §2.6)", () => {
        expect(properties["preciseScore"]?.["maximum"]).toBe(100);
      });

      it("has multipleOf constraint (spec 003 §2.6)", () => {
        expect(properties["preciseScore"]?.["multipleOf"]).toBe(0.5);
      });

      it("multipleOf 0.5 does NOT promote type to integer (only multipleOf:1 does)", () => {
        // spec 003 §2.1: integer promotion only when multipleOf === 1
        expect(properties["preciseScore"]?.["type"]).toBe("number");
      });

      it("has label → title", () => {
        expect(properties["preciseScore"]?.["title"]).toBe("Precise Score");
      });
    });

    // spec 003 §2.4: array with minItems + maxItems combined
    describe("tags field — minItems + maxItems on array", () => {
      it("has array type", () => {
        expect(properties["tags"]?.["type"]).toBe("array");
      });

      it("has minItems constraint (spec 003 §2.4)", () => {
        expect(properties["tags"]?.["minItems"]).toBe(1);
      });

      it("has maxItems constraint (spec 003 §2.4)", () => {
        expect(properties["tags"]?.["maxItems"]).toBe(5);
      });

      it("has label → title", () => {
        expect(properties["tags"]?.["title"]).toBe("Tags");
      });

      it("items schema is an object with value property", () => {
        const items = properties["tags"]?.["items"] as Record<string, unknown>;
        expect(items).toHaveProperty("type", "object");
        const itemProps = items["properties"] as Record<string, Record<string, unknown>>;
        expect(itemProps).toHaveProperty("value");
        expect(itemProps["value"]?.["type"]).toBe("string");
      });
    });

    it("required fields are correct", () => {
      const required = schema["required"] as string[];
      expect(required).toContain("name");
      expect(required).toContain("preciseScore");
      expect(required).toContain("tags");
    });
  });

  describe("UI Schema", () => {
    const ui = uiSchema as Record<string, unknown>;

    it("has VerticalLayout type", () => {
      expect(ui["type"]).toBe("VerticalLayout");
    });

    it("has control elements for all fields", () => {
      const elements = ui["elements"] as Record<string, unknown>[];
      const scopes = elements.map((el) => el["scope"]);
      expect(scopes).toContain("#/properties/name");
      expect(scopes).toContain("#/properties/preciseScore");
      expect(scopes).toContain("#/properties/tags");
    });
  });

  describe("Gold-master comparison", () => {
    it("matches expected JSON Schema", () => {
      const expected = loadExpected("chain-dsl/feature-composition.schema.json");
      expect(jsonSchema).toEqual(expected);
    });

    it("matches expected UI Schema", () => {
      const expected = loadExpected("chain-dsl/feature-composition.uischema.json");
      expect(uiSchema).toEqual(expected);
    });
  });
});
