/**
 * Integration tests verifying the full FormSpec flow.
 *
 * These tests verify that forms defined using the DSL compile correctly
 * to JSON Schema and UI Schema, and that the type inference is accurate.
 */

import { describe, it, expect } from "vitest";
import { buildFormSchemas } from "../index.js";
import { formspec, field, group, when, is } from "@formspec/dsl";
import type { InferFormSchema } from "@formspec/dsl";

describe("Integration: Complete form workflow", () => {
  it("should handle a realistic invoice form", () => {
    // Define a realistic invoice form
    const InvoiceForm = formspec(
      group("Customer",
        field.text("customerName", { label: "Customer Name", required: true }),
        field.text("customerEmail", { label: "Email", required: true }),
        field.object("billingAddress",
          field.text("street", { label: "Street", required: true }),
          field.text("city", { label: "City", required: true }),
          field.text("state", { label: "State" }),
          field.text("zip", { label: "ZIP Code" }),
        ),
      ),
      group("Invoice Details",
        field.enum("status", ["draft", "sent", "paid", "overdue"] as const, {
          label: "Status",
          required: true,
        }),
        field.number("amount", { label: "Amount", min: 0, required: true }),
        field.array("lineItems",
          field.text("description", { label: "Description", required: true }),
          field.number("quantity", { label: "Qty", min: 1 }),
          field.number("unitPrice", { label: "Unit Price", min: 0 }),
        ),
      ),
      when(is("status", "draft"),
        field.text("internalNotes", { label: "Internal Notes" }),
      ),
    );

    // Generate schemas
    const { jsonSchema, uiSchema } = buildFormSchemas(InvoiceForm);

    // Verify JSON Schema structure
    expect(jsonSchema.$schema).toBe("https://json-schema.org/draft-07/schema#");
    expect(jsonSchema.type).toBe("object");

    // Verify required fields
    expect(jsonSchema.required).toContain("customerName");
    expect(jsonSchema.required).toContain("customerEmail");
    expect(jsonSchema.required).toContain("status");
    expect(jsonSchema.required).toContain("amount");

    // Verify nested object structure
    expect(jsonSchema.properties?.["billingAddress"]).toMatchObject({
      type: "object",
      properties: {
        street: { type: "string" },
        city: { type: "string" },
        state: { type: "string" },
        zip: { type: "string" },
      },
      required: ["street", "city"],
    });

    // Verify array structure
    expect(jsonSchema.properties?.["lineItems"]).toMatchObject({
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: "number", minimum: 1 },
          unitPrice: { type: "number", minimum: 0 },
        },
        required: ["description"],
      },
    });

    // Verify enum
    expect(jsonSchema.properties?.["status"]).toMatchObject({
      type: "string",
      enum: ["draft", "sent", "paid", "overdue"],
    });

    // Verify UI Schema structure
    expect(uiSchema.type).toBe("VerticalLayout");
    expect(uiSchema.elements.length).toBeGreaterThan(0);

    // Verify groups in UI Schema
    const groups = uiSchema.elements.filter((el) => el.type === "Group");
    expect(groups).toHaveLength(2);

    // Verify conditional field has rule
    const conditionalField = uiSchema.elements.find(
      (el) => el.type === "Control" && "scope" in el && el.scope === "#/properties/internalNotes"
    );
    expect(conditionalField?.rule).toBeDefined();
    expect(conditionalField?.rule?.effect).toBe("SHOW");
    expect(conditionalField?.rule?.condition.schema).toMatchObject({
      const: "draft",
    });

    // Type inference test (compile-time check)
    type InvoiceSchema = InferFormSchema<typeof InvoiceForm>;
    const _schemaTypeCheck: InvoiceSchema = {
      customerName: "Acme Corp",
      customerEmail: "contact@acme.com",
      billingAddress: {
        street: "123 Main St",
        city: "San Francisco",
        state: "CA",
        zip: "94105",
      },
      status: "draft",
      amount: 1000,
      lineItems: [
        { description: "Consulting", quantity: 10, unitPrice: 100 },
      ],
      internalNotes: "Priority customer",
    };

    // The type check above verifies at compile time that the inferred schema matches
    expect(_schemaTypeCheck).toBeDefined();
  });

  it("should handle deeply nested conditionals", () => {
    const PaymentForm = formspec(
      field.enum("country", ["US", "CA", "GB"] as const, { label: "Country", required: true }),
      field.enum("paymentMethod", ["card", "bank", "wallet"] as const, {
        label: "Payment Method",
        required: true,
      }),
      when(is("country", "US"),
        field.text("ssn", { label: "SSN (last 4)" }),
        when(is("paymentMethod", "bank"),
          field.text("routingNumber", { label: "Routing Number" }),
          field.text("accountNumber", { label: "Account Number" }),
        ),
      ),
      when(is("country", "GB"),
        field.text("sortCode", { label: "Sort Code" }),
      ),
    );

    const { jsonSchema, uiSchema } = buildFormSchemas(PaymentForm);

    // All conditional fields should be in schema
    expect(Object.keys(jsonSchema.properties ?? {})).toContain("ssn");
    expect(Object.keys(jsonSchema.properties ?? {})).toContain("routingNumber");
    expect(Object.keys(jsonSchema.properties ?? {})).toContain("accountNumber");
    expect(Object.keys(jsonSchema.properties ?? {})).toContain("sortCode");

    // Nested conditional should have combined rule
    const routingField = uiSchema.elements.find(
      (el) => el.type === "Control" && "scope" in el && el.scope === "#/properties/routingNumber"
    );
    expect(routingField?.rule?.condition.schema.allOf).toHaveLength(2);
  });

  it("should handle forms with dynamic enums", () => {
    // Simulate a form with dynamic data sources
    const AddressForm = formspec(
      field.dynamicEnum("country", "countries", {
        label: "Country",
        required: true,
      }),
      field.dynamicEnum("state", "states", {
        label: "State",
        params: ["country"],
      }),
      field.text("city", { label: "City" }),
    );

    const { jsonSchema, uiSchema } = buildFormSchemas(AddressForm);

    // Dynamic enums should be strings in JSON Schema
    expect(jsonSchema.properties?.["country"]).toMatchObject({
      type: "string",
    });
    expect(jsonSchema.properties?.["state"]).toMatchObject({
      type: "string",
    });

    // UI Schema should have controls for all fields
    expect(uiSchema.elements).toHaveLength(3);
  });

  it("should handle complex nested object and array combinations", () => {
    const OrderForm = formspec(
      field.object("customer",
        field.text("name"),
        field.array("contacts",
          field.text("email"),
          field.text("phone"),
        ),
      ),
      field.array("orders",
        field.text("productId"),
        field.number("quantity"),
        field.object("shipping",
          field.text("method"),
          field.number("cost"),
        ),
      ),
    );

    const { jsonSchema } = buildFormSchemas(OrderForm);

    // Verify nested array inside object
    expect(jsonSchema.properties?.["customer"]).toMatchObject({
      type: "object",
      properties: {
        name: { type: "string" },
        contacts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              email: { type: "string" },
              phone: { type: "string" },
            },
          },
        },
      },
    });

    // Verify nested object inside array
    expect(jsonSchema.properties?.["orders"]).toMatchObject({
      type: "array",
      items: {
        type: "object",
        properties: {
          productId: { type: "string" },
          quantity: { type: "number" },
          shipping: {
            type: "object",
            properties: {
              method: { type: "string" },
              cost: { type: "number" },
            },
          },
        },
      },
    });
  });
});
