/**
 * Integration tests for the decorated class -> static analysis -> JSON Schema pipeline.
 *
 * Tests the full pipeline: decorated TypeScript class -> analyzeClass -> generateClassSchemas
 * -> JSON Schema + UI Schema output, including extended and custom decorator support.
 *
 * @see packages/decorators/src/index.ts for decorator definitions
 * @see packages/build/src/analyzer/decorator-extractor.ts for brand resolution
 */

import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { generateSchemasFromClass } from "../generators/class-schema.js";
import { getSchemaExtension, type ExtendedJSONSchema7 } from "../json-schema/types.js";

const fixturesDir = path.join(__dirname, "fixtures");

describe("Decorator Pipeline Integration", () => {
  describe("Example A: Built-in decorators", () => {
    it("should generate correct JSON Schema from built-in decorators", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-a-builtins.ts"),
        className: "ExampleAForm",
      });

      const { jsonSchema } = result;

      // Top-level structure
      expect(jsonSchema.type).toBe("object");
      expect(jsonSchema.required).toContain("name");
      expect(jsonSchema.required).toContain("age");
      expect(jsonSchema.required).toContain("score");
      expect(jsonSchema.required).toContain("country");
      expect(jsonSchema.required).not.toContain("email");
      expect(jsonSchema.required).not.toContain("state");
      expect(jsonSchema.required).not.toContain("fax");

      // name: string constraints
      const nameSchema = jsonSchema.properties?.["name"];
      expect(nameSchema).toMatchObject({
        type: "string",
        title: "Full Name",
        description: "Your legal name",
        minLength: 2,
        maxLength: 100,
      });

      // age: numeric constraints
      const ageSchema = jsonSchema.properties?.["age"];
      expect(ageSchema).toMatchObject({
        type: "number",
        title: "Age",
        minimum: 0,
        maximum: 150,
      });

      // score: exclusive minimum
      const scoreSchema = jsonSchema.properties?.["score"];
      expect(scoreSchema).toMatchObject({
        type: "number",
        title: "Score",
        exclusiveMinimum: 0,
      });

      // email: optional, pattern
      const emailSchema = jsonSchema.properties?.["email"];
      expect(emailSchema).toMatchObject({
        type: "string",
        title: "Email",
        pattern: "^[^@]+@[^@]+$",
      });

      // country: enum
      const countrySchema = jsonSchema.properties?.["country"];
      expect(countrySchema?.enum).toEqual(["us", "ca"]);
      expect(countrySchema?.title).toBe("Country");

      // deprecated field
      const faxSchema = jsonSchema.properties?.["fax"];
      expect(faxSchema?.deprecated).toBe(true);
      expect(faxSchema?.title).toBe("Fax Number");

      // default value
      const roleSchema = jsonSchema.properties?.["role"];
      expect(roleSchema?.default).toBe("user");
      expect(roleSchema?.title).toBe("Role");
    });

    it("should generate correct uiSchema from built-in decorators", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-a-builtins.ts"),
        className: "ExampleAForm",
      });

      const { uiSchema } = result;
      const elements = uiSchema.elements;

      // name: label, description, required, string constraints
      const nameField = elements.find((e) => e.id === "name");
      expect(nameField).toMatchObject({
        _field: "text",
        id: "name",
        label: "Full Name",
        description: "Your legal name",
        required: true,
        minLength: 2,
        maxLength: 100,
      });

      // age: label, required, numeric constraints
      const ageField = elements.find((e) => e.id === "age");
      expect(ageField).toMatchObject({
        _field: "number",
        id: "age",
        label: "Age",
        required: true,
        min: 0,
        max: 150,
      });

      // email: optional (no required property)
      const emailField = elements.find((e) => e.id === "email");
      expect(emailField?.pattern).toBe("^[^@]+@[^@]+$");
      expect(emailField?.required).toBeUndefined();

      // country: group assignment and enum options
      const countryField = elements.find((e) => e.id === "country");
      expect(countryField?.group).toBe("Preferences");
      expect(countryField?.options).toEqual([
        { id: "us", label: "United States" },
        { id: "ca", label: "Canada" },
      ]);

      // state: showWhen condition
      const stateField = elements.find((e) => e.id === "state");
      expect(stateField?.showWhen).toEqual({ field: "country", value: "us" });
    });
  });

  describe("Example B: Extended decorators", () => {
    it("should map extended decorators to their built-in equivalents in JSON Schema", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-b-extended.ts"),
        className: "ExampleBForm",
      });

      const { jsonSchema } = result;

      // amount: should have Field metadata + Minimum/Maximum from Floor/Ceiling
      const amountSchema = jsonSchema.properties?.["amount"];
      expect(amountSchema).toMatchObject({
        type: "number",
        title: "Amount",
        description: "Total amount in cents",
        minimum: 0,
        maximum: 1000000,
      });

      // label: should have Field metadata
      const labelSchema = jsonSchema.properties?.["label"];
      expect(labelSchema).toMatchObject({
        type: "string",
        title: "Label",
      });

      // No x-formspec-* extensions should be present (extended decorators map to built-ins)
      const amountKeys = Object.keys(amountSchema ?? {});
      const extensionKeys = amountKeys.filter((k) => k.startsWith("x-formspec-"));
      expect(extensionKeys).toHaveLength(0);
    });

    it("should map extended decorators to their built-in equivalents in uiSchema", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-b-extended.ts"),
        className: "ExampleBForm",
      });

      const { uiSchema } = result;

      // amount: Floor(0) -> min: 0, Ceiling(1000000) -> max: 1000000
      const amountField = uiSchema.elements.find((e) => e.id === "amount");
      expect(amountField).toMatchObject({
        _field: "number",
        id: "amount",
        label: "Amount",
        description: "Total amount in cents",
        required: true,
        min: 0,
        max: 1000000,
      });

      // label: CustomField -> label
      const labelField = uiSchema.elements.find((e) => e.id === "label");
      expect(labelField).toMatchObject({
        _field: "text",
        id: "label",
        label: "Label",
        required: true,
      });
    });
  });

  describe("Example C: Custom decorators", () => {
    it("should emit x-formspec-* extensions for custom decorators", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-c-custom.ts"),
        className: "ExampleCForm",
      });

      const { jsonSchema } = result;

      // heading: should have Title marker extension
      const headingSchema = jsonSchema.properties?.["heading"];
      if (!headingSchema) throw new Error("Expected heading schema to be defined");
      expect(headingSchema.title).toBe("Heading");
      expect(getSchemaExtension(headingSchema, "x-formspec-title-field")).toBe(true);

      // urgency: should have Priority parameterized extension + Minimum
      const urgencySchema = jsonSchema.properties?.["urgency"];
      if (!urgencySchema) throw new Error("Expected urgency schema to be defined");
      expect(urgencySchema.title).toBe("Urgency Score");
      expect(urgencySchema.minimum).toBe(1);
      expect(getSchemaExtension(urgencySchema, "x-formspec-priority")).toEqual({ level: "high" });
    });
  });

  describe("Example D: Non-FormSpec decorators are ignored", () => {
    it("should silently ignore decorators not from @formspec/decorators", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-d-mixed-decorators.ts"),
        className: "ExampleDForm",
      });

      const { jsonSchema, uiSchema } = result;

      // username: FormSpec decorators applied, ExternalValidator ignored
      expect(jsonSchema.properties?.["username"]).toMatchObject({
        type: "string",
        title: "Username",
      });

      // score: Minimum applied, ExternalValidator ignored
      expect(jsonSchema.properties?.["score"]).toMatchObject({
        type: "number",
        minimum: 0,
      });

      // plain: only ExternalValidator — no FormSpec metadata, but field still appears
      const plainSchema = jsonSchema.properties?.["plain"];
      expect(plainSchema).toMatchObject({ type: "string" });
      expect(plainSchema?.title).toBeUndefined();

      // uiSchema: username should have label from @Field, ExternalValidator ignored
      const usernameField = uiSchema.elements.find((e) => e.id === "username");
      expect(usernameField?.label).toBe("Username");

      // No x-formspec-* keys anywhere (ExternalValidator is not a custom decorator)
      for (const key of Object.keys(jsonSchema.properties ?? {})) {
        const schema = jsonSchema.properties?.[key];
        if (!schema) continue;
        const extensionKeys = Object.keys(schema).filter((k) => k.startsWith("x-formspec-"));
        expect(extensionKeys).toHaveLength(0);
      }
    });
  });

  describe("Example E: Custom decorators without extension namespace", () => {
    it("should recognize custom decorators but not emit x-formspec-* without namespace", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-e-no-namespace.ts"),
        className: "ExampleEForm",
      });

      const { jsonSchema } = result;

      // title: @Field metadata applied, Highlight marker recognized but no extension emitted
      expect(jsonSchema.properties?.["title"]).toMatchObject({
        type: "string",
        title: "Featured Title",
      });

      // notes: @Field metadata applied, Metadata recognized but no extension emitted
      expect(jsonSchema.properties?.["notes"]).toMatchObject({
        type: "string",
        title: "Notes",
      });

      // No x-formspec-* keys on any field (namespace-less custom decorators don't emit extensions)
      for (const key of Object.keys(jsonSchema.properties ?? {})) {
        const schema = jsonSchema.properties?.[key];
        if (!schema) continue;
        const extensionKeys = Object.keys(schema).filter((k) => k.startsWith("x-formspec-"));
        expect(extensionKeys).toHaveLength(0);
      }
    });
  });

  describe("Example F: JSDoc constraint tags", () => {
    it("should extract JSDoc constraints into JSON Schema", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-jsdoc-constraints.ts"),
        className: "JSDocConstraintsForm",
      });
      const { jsonSchema } = result;

      // name: minLength + maxLength from JSDoc
      expect(jsonSchema.properties?.["name"]).toMatchObject({
        type: "string",
        minLength: 1,
        maxLength: 200,
      });

      // age: minimum + maximum from JSDoc
      expect(jsonSchema.properties?.["age"]).toMatchObject({
        type: "number",
        minimum: 0,
        maximum: 150,
      });

      // weight: decimal values
      expect(jsonSchema.properties?.["weight"]).toMatchObject({
        type: "number",
        minimum: 0.01,
        maximum: 1000,
      });

      // temperature: negative minimum
      expect(jsonSchema.properties?.["temperature"]).toMatchObject({
        type: "number",
        minimum: -273.15,
      });

      // sku: pattern
      expect(jsonSchema.properties?.["sku"]).toMatchObject({
        type: "string",
        pattern: "^[A-Z]{3}-\\d{4}$",
      });

      // stock: cross-source (decorator @Minimum + JSDoc @ExclusiveMaximum)
      expect(jsonSchema.properties?.["stock"]).toMatchObject({
        type: "number",
        minimum: 0,
        exclusiveMaximum: 10000,
      });

      // notes: no constraints
      const notesSchema = jsonSchema.properties?.["notes"];
      expect(notesSchema?.type).toBe("string");
      expect(notesSchema?.minimum).toBeUndefined();
      expect(notesSchema?.minLength).toBeUndefined();
    });
  });

  describe("Nested class: decorator constraints", () => {
    it("should propagate decorator constraints into nested JSON Schema properties", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-nested-class.ts"),
        className: "UserWithAddress",
      });

      const { jsonSchema } = result;
      const addressSchema = jsonSchema.properties?.["address"] as ExtendedJSONSchema7 | undefined;

      // Address sub-schema carries street constraints
      expect(addressSchema?.properties?.["street"]).toMatchObject({
        minLength: 1,
        maxLength: 200,
      });

      // Zip carries pattern
      expect(addressSchema?.properties?.["zip"]).toMatchObject({
        pattern: "^\\d{5}(-\\d{4})?$",
      });

      // Required array on the nested object: street and city required, zip optional
      expect(addressSchema?.required).toContain("street");
      expect(addressSchema?.required).toContain("city");
      expect(addressSchema?.required).not.toContain("zip");
    });

    it("should propagate decorator constraints into nested uiSchema fields", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-nested-class.ts"),
        className: "UserWithAddress",
      });

      const { uiSchema } = result;
      const addressField = uiSchema.elements.find((e) => e.id === "address");

      expect(addressField?.fields).toBeDefined();

      const streetField = addressField?.fields?.find((f) => f.id === "street");
      expect(streetField).toMatchObject({
        minLength: 1,
        maxLength: 200,
        required: true,
      });
    });
  });

  describe("Nested class: JSDoc constraints", () => {
    it("should propagate JSDoc constraints into nested JSON Schema properties", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-nested-class.ts"),
        className: "ProductWithDimensions",
      });

      const { jsonSchema } = result;
      const dimSchema = jsonSchema.properties?.["dimensions"] as ExtendedJSONSchema7 | undefined;

      // width has both minimum and maximum from JSDoc
      expect(dimSchema?.properties?.["width"]).toMatchObject({
        minimum: 0,
        maximum: 10000,
      });

      // depth has minimum but no maximum
      const depthSchema = dimSchema?.properties?.["depth"] as ExtendedJSONSchema7 | undefined;
      expect(depthSchema?.minimum).toBe(0);
      expect(depthSchema?.maximum).toBeUndefined();
    });

    it("should propagate JSDoc constraints into nested uiSchema fields", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-nested-class.ts"),
        className: "ProductWithDimensions",
      });

      const { uiSchema } = result;
      const dimField = uiSchema.elements.find((e) => e.id === "dimensions");

      expect(dimField?.fields).toBeDefined();

      const widthField = dimField?.fields?.find((f) => f.id === "width");
      expect(widthField).toMatchObject({
        min: 0,
        max: 10000,
      });
    });
  });

  describe("Nested class: three-level nesting", () => {
    it("should propagate constraints through three levels of nesting in JSON Schema", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-nested-class.ts"),
        className: "Order",
      });

      const { jsonSchema } = result;
      const customerSchema = jsonSchema.properties?.["customer"] as ExtendedJSONSchema7 | undefined;

      // Level 2: customer.name has minLength
      expect(customerSchema?.properties?.["name"]).toMatchObject({
        minLength: 1,
      });

      // Level 3: customer.address.street has minLength and maxLength
      const addressSchema = customerSchema?.properties?.["address"] as
        | ExtendedJSONSchema7
        | undefined;
      expect(addressSchema?.properties?.["street"]).toMatchObject({
        minLength: 1,
        maxLength: 200,
      });
    });

    it("should propagate constraints through three levels of nesting in uiSchema", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-nested-class.ts"),
        className: "Order",
      });

      const { uiSchema } = result;
      const customerField = uiSchema.elements.find((e) => e.id === "customer");

      expect(customerField?.fields).toBeDefined();

      // Level 2: customer name field has constraints
      const nameField = customerField?.fields?.find((f) => f.id === "name");
      expect(nameField?.minLength).toBe(1);

      // Level 3: customer > address > street
      const addressField = customerField?.fields?.find((f) => f.id === "address");
      expect(addressField?.fields).toBeDefined();

      const streetField = addressField?.fields?.find((f) => f.id === "street");
      expect(streetField).toMatchObject({
        minLength: 1,
        maxLength: 200,
        required: true,
      });
    });
  });

  describe("Nested class: circular references", () => {
    it("should complete without hanging on circular class references", { timeout: 5000 }, () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-nested-class.ts"),
        className: "NodeA",
      });

      const { jsonSchema } = result;

      // Basic structure is valid
      expect(jsonSchema.type).toBe("object");
      expect(jsonSchema.properties?.["name"]).toMatchObject({
        minLength: 1,
      });

      // Sibling property exists (may be bare { type: "object" } at the cycle point)
      expect(jsonSchema.properties?.["sibling"]).toBeDefined();
    });
  });

  describe("Nested class: non-class object types (regression)", () => {
    it("should handle inline object types without errors", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-nested-class.ts"),
        className: "WithInlineObject",
      });

      const { jsonSchema } = result;
      const metadataSchema = jsonSchema.properties?.["metadata"] as ExtendedJSONSchema7 | undefined;

      // Structural extraction still works — key has type string
      expect(metadataSchema?.properties?.["key"]).toMatchObject({
        type: "string",
      });

      // No decorator constraints on inline object properties
      const keySchema = metadataSchema?.properties?.["key"] as ExtendedJSONSchema7 | undefined;
      expect(keySchema?.minLength).toBeUndefined();
      expect(keySchema?.maxLength).toBeUndefined();
    });
  });

  describe("Error handling", () => {
    it("should throw when class is not found", () => {
      expect(() =>
        generateSchemasFromClass({
          filePath: path.join(fixturesDir, "example-a-builtins.ts"),
          className: "NonExistentForm",
        })
      ).toThrow('Class "NonExistentForm" not found');
    });
  });
});
