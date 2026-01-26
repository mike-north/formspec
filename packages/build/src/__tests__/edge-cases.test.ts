/**
 * Edge case and error handling tests.
 *
 * These tests verify correct behavior in unusual or boundary situations.
 */

import { describe, it, expect } from "vitest";
import { buildFormSchemas, generateJsonSchema, generateUiSchema } from "../index.js";
import { formspec, field, group, when, is } from "@formspec/dsl";

describe("Edge cases: Empty and minimal forms", () => {
  it("should handle form with no fields", () => {
    const emptyForm = formspec();

    const { jsonSchema, uiSchema } = buildFormSchemas(emptyForm);

    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.properties).toEqual({});
    expect(jsonSchema.required).toBeUndefined();

    expect(uiSchema.type).toBe("VerticalLayout");
    expect(uiSchema.elements).toEqual([]);
  });

  it("should handle empty group", () => {
    const form = formspec(
      group("Empty Group"),
    );

    const { jsonSchema, uiSchema } = buildFormSchemas(form);

    expect(jsonSchema.properties).toEqual({});
    expect(uiSchema.elements).toHaveLength(1);
    expect(uiSchema.elements[0]).toMatchObject({
      type: "Group",
      label: "Empty Group",
      elements: [],
    });
  });

  it("should handle empty conditional", () => {
    const form = formspec(
      field.enum("type", ["a", "b"] as const),
      when(is("type", "a")),
    );

    const { jsonSchema, uiSchema } = buildFormSchemas(form);

    // Only the enum field should exist
    expect(Object.keys(jsonSchema.properties ?? {})).toEqual(["type"]);
    expect(uiSchema.elements).toHaveLength(1);
  });

  it("should handle empty array field", () => {
    const form = formspec(
      field.array("items"),
    );

    const { jsonSchema } = buildFormSchemas(form);

    expect(jsonSchema.properties?.["items"]).toMatchObject({
      type: "array",
      items: {
        type: "object",
        properties: {},
      },
    });
  });

  it("should handle empty object field", () => {
    const form = formspec(
      field.object("data"),
    );

    const { jsonSchema } = buildFormSchemas(form);

    expect(jsonSchema.properties?.["data"]).toMatchObject({
      type: "object",
      properties: {},
    });
  });
});

describe("Edge cases: Field names", () => {
  it("should handle field names with special characters", () => {
    const form = formspec(
      field.text("field_with_underscore"),
      field.text("field-with-dash"),
      field.text("field123"),
    );

    const { jsonSchema, uiSchema } = buildFormSchemas(form);

    expect(jsonSchema.properties?.["field_with_underscore"]).toBeDefined();
    expect(jsonSchema.properties?.["field-with-dash"]).toBeDefined();
    expect(jsonSchema.properties?.["field123"]).toBeDefined();

    // All scopes should be properly formed
    expect(uiSchema.elements[0]).toMatchObject({
      scope: "#/properties/field_with_underscore",
    });
    expect(uiSchema.elements[1]).toMatchObject({
      scope: "#/properties/field-with-dash",
    });
  });

  it("should handle single character field names", () => {
    const form = formspec(
      field.text("a"),
      field.number("b"),
      field.boolean("c"),
    );

    const { jsonSchema } = buildFormSchemas(form);

    expect(Object.keys(jsonSchema.properties ?? {})).toEqual(["a", "b", "c"]);
  });
});

describe("Edge cases: Number constraints", () => {
  it("should handle zero as min/max", () => {
    const form = formspec(
      field.number("zeroMin", { min: 0 }),
      field.number("zeroMax", { max: 0 }),
      field.number("zeroRange", { min: 0, max: 0 }),
    );

    const { jsonSchema } = buildFormSchemas(form);

    expect(jsonSchema.properties?.["zeroMin"]).toMatchObject({
      type: "number",
      minimum: 0,
    });
    expect(jsonSchema.properties?.["zeroMax"]).toMatchObject({
      type: "number",
      maximum: 0,
    });
    expect(jsonSchema.properties?.["zeroRange"]).toMatchObject({
      type: "number",
      minimum: 0,
      maximum: 0,
    });
  });

  it("should handle negative min/max", () => {
    const form = formspec(
      field.number("temperature", { min: -273, max: 1000000 }),
    );

    const { jsonSchema } = buildFormSchemas(form);

    expect(jsonSchema.properties?.["temperature"]).toMatchObject({
      type: "number",
      minimum: -273,
      maximum: 1000000,
    });
  });
});

describe("Edge cases: Enum options", () => {
  it("should handle single option enum", () => {
    const form = formspec(
      field.enum("singleOption", ["only"] as const),
    );

    const { jsonSchema } = buildFormSchemas(form);

    expect(jsonSchema.properties?.["singleOption"]).toMatchObject({
      type: "string",
      enum: ["only"],
    });
  });

  it("should handle enum with empty string option", () => {
    const form = formspec(
      field.enum("withEmpty", ["", "value"] as const),
    );

    const { jsonSchema } = buildFormSchemas(form);

    expect(jsonSchema.properties?.["withEmpty"]).toMatchObject({
      type: "string",
      enum: ["", "value"],
    });
  });
});

describe("Edge cases: Conditional values", () => {
  it("should handle boolean conditional value", () => {
    const form = formspec(
      field.boolean("enabled"),
      when(is("enabled", true),
        field.text("config"),
      ),
    );

    const { uiSchema } = buildFormSchemas(form);

    const conditionalField = uiSchema.elements.find(
      (el) => el.type === "Control" && "scope" in el && el.scope === "#/properties/config"
    );
    expect(conditionalField?.rule?.condition.schema).toMatchObject({
      const: true,
    });
  });

  it("should handle null conditional value", () => {
    const form = formspec(
      field.text("optional"),
      when(is("optional", null),
        field.text("fallback"),
      ),
    );

    const { uiSchema } = buildFormSchemas(form);

    const conditionalField = uiSchema.elements.find(
      (el) => el.type === "Control" && "scope" in el && el.scope === "#/properties/fallback"
    );
    expect(conditionalField?.rule?.condition.schema).toMatchObject({
      const: null,
    });
  });

  it("should handle number conditional value", () => {
    const form = formspec(
      field.number("quantity"),
      when(is("quantity", 0),
        field.text("zeroReason", { label: "Why zero?" }),
      ),
    );

    const { uiSchema } = buildFormSchemas(form);

    const conditionalField = uiSchema.elements.find(
      (el) => el.type === "Control" && "scope" in el && el.scope === "#/properties/zeroReason"
    );
    expect(conditionalField?.rule?.condition.schema).toMatchObject({
      const: 0,
    });
  });
});

describe("Edge cases: Array min/max items", () => {
  it("should handle minItems of 0", () => {
    const form = formspec(
      field.arrayWithConfig("items", { minItems: 0 },
        field.text("name"),
      ),
    );

    const { jsonSchema } = buildFormSchemas(form);

    expect(jsonSchema.properties?.["items"]).toMatchObject({
      type: "array",
      minItems: 0,
    });
  });

  it("should handle minItems equal to maxItems", () => {
    const form = formspec(
      field.arrayWithConfig("exactFive", { minItems: 5, maxItems: 5 },
        field.text("item"),
      ),
    );

    const { jsonSchema } = buildFormSchemas(form);

    expect(jsonSchema.properties?.["exactFive"]).toMatchObject({
      type: "array",
      minItems: 5,
      maxItems: 5,
    });
  });
});

describe("Edge cases: Deeply nested structures", () => {
  it("should handle 3+ levels of nesting", () => {
    const form = formspec(
      field.object("level1",
        field.object("level2",
          field.object("level3",
            field.text("deepValue"),
          ),
        ),
      ),
    );

    const { jsonSchema } = buildFormSchemas(form);

    expect(
      jsonSchema.properties?.["level1"]
    ).toMatchObject({
      type: "object",
      properties: {
        level2: {
          type: "object",
          properties: {
            level3: {
              type: "object",
              properties: {
                deepValue: { type: "string" },
              },
            },
          },
        },
      },
    });
  });

  it("should handle conditionals inside groups inside conditionals", () => {
    const form = formspec(
      field.enum("outer", ["a", "b"] as const),
      when(is("outer", "a"),
        group("Inner Group",
          field.enum("inner", ["x", "y"] as const),
          when(is("inner", "x"),
            field.text("deepest"),
          ),
        ),
      ),
    );

    const { jsonSchema, uiSchema } = buildFormSchemas(form);

    // All fields should be in schema
    expect(Object.keys(jsonSchema.properties ?? {})).toContain("outer");
    expect(Object.keys(jsonSchema.properties ?? {})).toContain("inner");
    expect(Object.keys(jsonSchema.properties ?? {})).toContain("deepest");

    // Find the deepest field and verify it has combined rules
    const deepestControl = uiSchema.elements.find((el) => {
      if (el.type === "Group") {
        return el.elements.some(
          (inner) =>
            inner.type === "Control" &&
            "scope" in inner &&
            inner.scope === "#/properties/deepest"
        );
      }
      return false;
    });

    expect(deepestControl).toBeDefined();
  });
});
