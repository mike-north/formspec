import { describe, it, expect } from "vitest";
import { buildFormSchemas, generateJsonSchema, generateUiSchema } from "../index.js";
import { formspec, field, group, when, is } from "@formspec/dsl";

describe("generateJsonSchema", () => {
  it("should generate schema for basic fields", () => {
    const form = formspec(
      field.text("name", { label: "Name" }),
      field.number("age", { min: 0, max: 150 }),
      field.boolean("active")
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
      field.enum("status", ["draft", "sent", "paid"] as const, { label: "Status" })
    );

    const schema = generateJsonSchema(form);

    // Per JSON Schema spec: enum values are self-constraining; type is redundant alongside enum
    expect(schema.properties?.["status"]).toEqual({
      title: "Status",
      enum: ["draft", "sent", "paid"],
    });
  });

  it("should generate schema for enum fields with object options", () => {
    const form = formspec(
      field.enum(
        "priority",
        [
          { id: "low", label: "Low Priority" },
          { id: "medium", label: "Medium Priority" },
          { id: "high", label: "High Priority" },
        ] as const,
        { label: "Priority" }
      )
    );

    const schema = generateJsonSchema(form);

    expect(schema.properties?.["priority"]).toEqual({
      title: "Priority",
      oneOf: [
        { const: "low", title: "Low Priority" },
        { const: "medium", title: "Medium Priority" },
        { const: "high", title: "High Priority" },
      ],
    });
    // Per spec: type is not emitted alongside oneOf
    expect(schema.properties?.["priority"]).not.toHaveProperty("type");
  });

  it("should handle required fields", () => {
    const form = formspec(field.text("name", { required: true }), field.text("optional"));

    const schema = generateJsonSchema(form);

    expect(schema.required).toEqual(["name"]);
  });

  it("should extract fields from groups", () => {
    const form = formspec(group("Customer", field.text("name"), field.text("email")));

    const schema = generateJsonSchema(form);

    expect(Object.keys(schema.properties ?? {})).toEqual(["name", "email"]);
  });

  it("should extract fields from conditionals", () => {
    const form = formspec(
      field.enum("type", ["a", "b"] as const),
      when(is("type", "a"), field.text("extra"))
    );

    const schema = generateJsonSchema(form);

    expect(Object.keys(schema.properties ?? {})).toEqual(["type", "extra"]);
  });

  it("should deduplicate required array when same field appears in multiple conditionals", () => {
    const form = formspec(
      field.enum("type", ["a", "b", "c"] as const, { required: true }),
      field.text("name", { required: true }), // required at root
      when(
        is("type", "a"),
        field.text("name", { required: true }) // same field in conditional
      ),
      when(
        is("type", "b"),
        field.text("name", { required: true }) // same field in another conditional
      )
    );

    const schema = generateJsonSchema(form);

    // "name" should only appear once in required array, not 3 times
    expect(schema.required).toBeDefined();
    expect(schema.required?.filter((r) => r === "name")).toHaveLength(1);
    expect(schema.required?.filter((r) => r === "type")).toHaveLength(1);
  });

  it("should include x-formspec-source for dynamic enum fields", () => {
    const form = formspec(field.dynamicEnum("country", "countries", { label: "Country" }));

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
      })
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
      })
    );

    const schema = generateJsonSchema(form);

    expect(schema.properties?.["paymentDetails"]).toMatchObject({
      type: "object",
      title: "Payment Details",
      additionalProperties: true,
      "x-formspec-schemaSource": "stripe-payment-form",
    });
  });

  // Task #19: DynamicSchemaField params
  it("should include x-formspec-params for dynamic schema with params", () => {
    const form = formspec(field.dynamicSchema("settings", "app_settings", { params: ["appId"] }));

    const schema = generateJsonSchema(form);

    expect(schema.properties?.["settings"]).toMatchObject({
      type: "object",
      additionalProperties: true,
      "x-formspec-schemaSource": "app_settings",
      "x-formspec-params": ["appId"],
    });
  });

  it("should NOT include x-formspec-params for dynamic schema without params", () => {
    const form = formspec(field.dynamicSchema("settings", "app_settings"));

    const schema = generateJsonSchema(form);

    expect(schema.properties?.["settings"]).not.toHaveProperty("x-formspec-params");
  });

  it("should NOT include x-formspec-params for dynamic schema with empty params array", () => {
    const form = formspec(field.dynamicSchema("settings", "app_settings", { params: [] }));

    const schema = generateJsonSchema(form);

    expect(schema.properties?.["settings"]).not.toHaveProperty("x-formspec-params");
  });

  // Task #5: String constraints on TextField
  it("should emit string constraints on text fields", () => {
    const form = formspec(
      field.text("email", {
        minLength: 5,
        maxLength: 100,
        pattern: "^[^@]+@[^@]+$",
      })
    );

    const schema = generateJsonSchema(form);

    expect(schema.properties?.["email"]).toEqual({
      type: "string",
      minLength: 5,
      maxLength: 100,
      pattern: "^[^@]+@[^@]+$",
    });
  });

  it("should emit only provided string constraints on text fields", () => {
    const form = formspec(field.text("name", { minLength: 1 }));

    const schema = generateJsonSchema(form);

    const prop = schema.properties?.["name"];
    expect(prop).toMatchObject({ type: "string", minLength: 1 });
    expect(prop).not.toHaveProperty("maxLength");
    expect(prop).not.toHaveProperty("pattern");
  });

  it("should not emit string constraints when not specified", () => {
    const form = formspec(field.text("notes"));

    const schema = generateJsonSchema(form);

    const prop = schema.properties?.["notes"];
    expect(prop).toEqual({ type: "string" });
  });

  // Task #13: Conditional required leak
  it("should not include conditional fields in required array", () => {
    const form = formspec(
      field.enum("type", ["a", "b"] as const, { required: true }),
      when(is("type", "a"), field.text("extra", { required: true }))
    );

    const schema = generateJsonSchema(form);

    expect(schema.required).toContain("type");
    expect(schema.required).not.toContain("extra");
  });

  // Task #18: Type alongside oneOf
  it("should not include type alongside oneOf for object options", () => {
    const form = formspec(
      field.enum("priority", [
        { id: "low", label: "Low" },
        { id: "high", label: "High" },
      ] as const)
    );

    const schema = generateJsonSchema(form);

    const prop = schema.properties?.["priority"];
    expect(prop).toHaveProperty("oneOf");
    expect(prop).not.toHaveProperty("type");
    expect(prop).not.toHaveProperty("enum");
  });
});

describe("generateUiSchema", () => {
  it("should generate vertical layout for basic fields", () => {
    const form = formspec(field.text("name", { label: "Name" }));

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
    const form = formspec(group("Customer Info", field.text("name")));

    const uiSchema = generateUiSchema(form);

    expect(uiSchema.elements[0]).toMatchObject({
      type: "Group",
      label: "Customer Info",
      elements: [{ type: "Control", scope: "#/properties/name" }],
    });
  });

  it("should generate rules for conditionals", () => {
    const form = formspec(
      field.enum("status", ["draft", "sent"] as const),
      when(is("status", "draft"), field.text("notes", { label: "Notes" }))
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
    const form = formspec(field.array("addresses", field.text("street"), field.text("city")));

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
      field.arrayWithConfig(
        "items",
        { label: "Line Items", minItems: 1, maxItems: 10 },
        field.text("description"),
        field.number("quantity")
      )
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
      field.object("address", field.text("street"), field.text("city"), field.text("zip"))
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
      field.object(
        "address",
        field.text("street", { required: true }),
        field.text("city", { required: true }),
        field.text("zip")
      )
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
      when(
        is("country", "US"),
        when(is("paymentMethod", "bank"), field.text("routingNumber", { label: "Routing Number" }))
      )
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
    const form = formspec(field.text("name"));

    const result = buildFormSchemas(form);

    expect(result.jsonSchema).toBeDefined();
    expect(result.jsonSchema.$schema).toBe("https://json-schema.org/draft-07/schema#");
    expect(result.uiSchema).toBeDefined();
    expect(result.uiSchema.type).toBe("VerticalLayout");
  });
});

// Issue 1: multipleOf on number fields
describe("generateJsonSchema - multipleOf", () => {
  it("emits multipleOf on number fields", () => {
    const form = formspec(
      field.number("quantity", { multipleOf: 1 }),
      field.number("price", { multipleOf: 0.01 })
    );
    const { jsonSchema } = buildFormSchemas(form);
    expect(jsonSchema.properties?.["quantity"]?.multipleOf).toBe(1);
    expect(jsonSchema.properties?.["quantity"]?.type).toBe("number"); // NOT "integer" — that's a higher-layer concern
    expect(jsonSchema.properties?.["price"]?.multipleOf).toBe(0.01);
  });

  it("does not emit multipleOf when not specified", () => {
    const form = formspec(field.number("quantity"));
    const { jsonSchema } = buildFormSchemas(form);
    expect(jsonSchema.properties?.["quantity"]).not.toHaveProperty("multipleOf");
  });
});

// Issue 4: enum fields must NOT emit type alongside enum
describe("generateJsonSchema - enum type omission", () => {
  it("string literal enum has no type property", () => {
    const form = formspec(field.enum("status", ["draft", "active"] as const));
    const { jsonSchema } = buildFormSchemas(form);
    expect(jsonSchema.properties?.["status"]?.enum).toEqual(["draft", "active"]);
    expect(jsonSchema.properties?.["status"]?.type).toBeUndefined();
  });

  it("string literal enum with label has no type property", () => {
    const form = formspec(
      field.enum("status", ["draft", "sent", "paid"] as const, { label: "Status" })
    );
    const schema = generateJsonSchema(form);
    expect(schema.properties?.["status"]).toEqual({
      title: "Status",
      enum: ["draft", "sent", "paid"],
    });
    expect(schema.properties?.["status"]).not.toHaveProperty("type");
  });
});
