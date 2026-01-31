import { describe, it, expect } from "vitest";
import { buildFormSchemas, generateJsonSchema, generateUiSchema } from "../index.js";
import { formspec, field, group, when, is } from "@formspec/dsl";

describe("generateJsonSchema", () => {
  it("should generate schema for basic fields", () => {
    const form = formspec(
      field.text("name", { label: "Name" }),
      field.number("age", { min: 0, max: 150 }),
      field.boolean("active"),
    );

    const schema = generateJsonSchema(form);

    expect(schema.$schema).toBe("https://json-schema.org/draft-07/schema#");
    expect(schema.type).toBe("object");
    expect(schema.properties).toEqual({
      name: { type: "string", title: "Name" },
      age: { type: "number", minimum: 0, maximum: 150 },
      active: { type: "boolean" },
    });
  });

  it("should generate schema for enum fields", () => {
    const form = formspec(
      field.enum("status", ["draft", "sent", "paid"] as const, { label: "Status" }),
    );

    const schema = generateJsonSchema(form);

    expect(schema.properties?.["status"]).toEqual({
      type: "string",
      title: "Status",
      enum: ["draft", "sent", "paid"],
    });
  });

  it("should generate schema for enum fields with object options", () => {
    const form = formspec(
      field.enum("priority", [
        { id: "low", label: "Low Priority" },
        { id: "medium", label: "Medium Priority" },
        { id: "high", label: "High Priority" },
      ] as const, { label: "Priority" }),
    );

    const schema = generateJsonSchema(form);

    expect(schema.properties?.["priority"]).toEqual({
      type: "string",
      title: "Priority",
      oneOf: [
        { const: "low", title: "Low Priority" },
        { const: "medium", title: "Medium Priority" },
        { const: "high", title: "High Priority" },
      ],
    });
  });

  it("should handle required fields", () => {
    const form = formspec(
      field.text("name", { required: true }),
      field.text("optional"),
    );

    const schema = generateJsonSchema(form);

    expect(schema.required).toEqual(["name"]);
  });

  it("should extract fields from groups", () => {
    const form = formspec(
      group("Customer",
        field.text("name"),
        field.text("email"),
      ),
    );

    const schema = generateJsonSchema(form);

    expect(Object.keys(schema.properties ?? {})).toEqual(["name", "email"]);
  });

  it("should extract fields from conditionals", () => {
    const form = formspec(
      field.enum("type", ["a", "b"] as const),
      when(is("type", "a"),
        field.text("extra"),
      ),
    );

    const schema = generateJsonSchema(form);

    expect(Object.keys(schema.properties ?? {})).toEqual(["type", "extra"]);
  });

  it("should include x-formspec-source for dynamic enum fields", () => {
    const form = formspec(
      field.dynamicEnum("country", "countries", { label: "Country" }),
    );

    const schema = generateJsonSchema(form);

    expect(schema.properties?.["country"]).toMatchObject({
      type: "string",
      title: "Country",
      "x-formspec-source": "countries",
    });
  });

  it("should include x-formspec-params for dynamic enum with dependencies", () => {
    const form = formspec(
      field.dynamicEnum("city", "cities", {
        label: "City",
        params: ["country", "state"],
      }),
    );

    const schema = generateJsonSchema(form);

    expect(schema.properties?.["city"]).toMatchObject({
      type: "string",
      "x-formspec-source": "cities",
      "x-formspec-params": ["country", "state"],
    });
  });

  it("should include x-formspec-schemaSource for dynamic schema fields", () => {
    const form = formspec(
      field.dynamicSchema("paymentDetails", "stripe-payment-form", {
        label: "Payment Details",
      }),
    );

    const schema = generateJsonSchema(form);

    expect(schema.properties?.["paymentDetails"]).toMatchObject({
      type: "object",
      title: "Payment Details",
      additionalProperties: true,
      "x-formspec-schemaSource": "stripe-payment-form",
    });
  });
});

describe("generateUiSchema", () => {
  it("should generate vertical layout for basic fields", () => {
    const form = formspec(
      field.text("name", { label: "Name" }),
    );

    const uiSchema = generateUiSchema(form);

    expect(uiSchema.type).toBe("VerticalLayout");
    expect(uiSchema.elements).toHaveLength(1);
    expect(uiSchema.elements[0]).toEqual({
      type: "Control",
      scope: "#/properties/name",
      label: "Name",
    });
  });

  it("should generate groups", () => {
    const form = formspec(
      group("Customer Info",
        field.text("name"),
      ),
    );

    const uiSchema = generateUiSchema(form);

    expect(uiSchema.elements[0]).toMatchObject({
      type: "Group",
      label: "Customer Info",
      elements: [
        { type: "Control", scope: "#/properties/name" },
      ],
    });
  });

  it("should generate rules for conditionals", () => {
    const form = formspec(
      field.enum("status", ["draft", "sent"] as const),
      when(is("status", "draft"),
        field.text("notes", { label: "Notes" }),
      ),
    );

    const uiSchema = generateUiSchema(form);

    // First element is the status control
    expect(uiSchema.elements[0]).toMatchObject({
      type: "Control",
      scope: "#/properties/status",
    });

    // Second element is the notes control with a rule
    expect(uiSchema.elements[1]).toMatchObject({
      type: "Control",
      scope: "#/properties/notes",
      label: "Notes",
      rule: {
        effect: "SHOW",
        condition: {
          scope: "#/properties/status",
          schema: { const: "draft" },
        },
      },
    });
  });
});

describe("generateJsonSchema - array fields", () => {
  it("should generate schema for array fields", () => {
    const form = formspec(
      field.array("addresses",
        field.text("street"),
        field.text("city"),
      ),
    );

    const schema = generateJsonSchema(form);

    expect(schema.properties?.["addresses"]).toEqual({
      type: "array",
      items: {
        type: "object",
        properties: {
          street: { type: "string" },
          city: { type: "string" },
        },
      },
    });
  });

  it("should handle array fields with min/max items", () => {
    const form = formspec(
      field.arrayWithConfig("items", { label: "Line Items", minItems: 1, maxItems: 10 },
        field.text("description"),
        field.number("quantity"),
      ),
    );

    const schema = generateJsonSchema(form);

    expect(schema.properties?.["items"]).toMatchObject({
      type: "array",
      title: "Line Items",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
        },
      },
    });
  });
});

describe("generateJsonSchema - object fields", () => {
  it("should generate schema for object fields", () => {
    const form = formspec(
      field.object("address",
        field.text("street"),
        field.text("city"),
        field.text("zip"),
      ),
    );

    const schema = generateJsonSchema(form);

    expect(schema.properties?.["address"]).toEqual({
      type: "object",
      properties: {
        street: { type: "string" },
        city: { type: "string" },
        zip: { type: "string" },
      },
    });
  });

  it("should handle required fields within object fields", () => {
    const form = formspec(
      field.object("address",
        field.text("street", { required: true }),
        field.text("city", { required: true }),
        field.text("zip"),
      ),
    );

    const schema = generateJsonSchema(form);

    expect(schema.properties?.["address"]).toMatchObject({
      type: "object",
      properties: {
        street: { type: "string" },
        city: { type: "string" },
        zip: { type: "string" },
      },
      required: ["street", "city"],
    });
  });
});

describe("generateUiSchema - nested conditionals", () => {
  it("should combine rules for nested conditionals", () => {
    const form = formspec(
      field.enum("country", ["US", "CA"] as const),
      field.enum("paymentMethod", ["card", "bank"] as const),
      when(is("country", "US"),
        when(is("paymentMethod", "bank"),
          field.text("routingNumber", { label: "Routing Number" }),
        ),
      ),
    );

    const uiSchema = generateUiSchema(form);

    // Find the routingNumber control
    const routingControl = uiSchema.elements.find(
      (el) => el.type === "Control" && "scope" in el && el.scope === "#/properties/routingNumber"
    );

    expect(routingControl).toBeDefined();
    expect(routingControl?.rule).toBeDefined();

    // The combined rule should use allOf to require both conditions
    expect(routingControl?.rule?.condition.schema.allOf).toHaveLength(2);
    expect(routingControl?.rule?.condition.schema.allOf?.[0]).toMatchObject({
      properties: { country: { const: "US" } },
    });
    expect(routingControl?.rule?.condition.schema.allOf?.[1]).toMatchObject({
      properties: { paymentMethod: { const: "bank" } },
    });
  });
});

describe("buildFormSchemas", () => {
  it("should return both schemas", () => {
    const form = formspec(
      field.text("name"),
    );

    const result = buildFormSchemas(form);

    expect(result.jsonSchema).toBeDefined();
    expect(result.jsonSchema.$schema).toBe("https://json-schema.org/draft-07/schema#");
    expect(result.uiSchema).toBeDefined();
    expect(result.uiSchema.type).toBe("VerticalLayout");
  });
});
