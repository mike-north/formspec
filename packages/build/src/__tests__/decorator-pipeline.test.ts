/**
 * Integration tests for the decorated class -> static analysis -> JSON Schema pipeline.
 *
 * Tests the full pipeline: decorated TypeScript class -> analyzeClassToIR -> generateClassSchemas
 * -> JSON Schema 2020-12 + UI Schema output, including extended and custom decorator support.
 *
 * @see packages/decorators/src/index.ts for decorator definitions
 * @see packages/build/src/analyzer/decorator-extractor.ts for brand resolution
 */

import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { generateSchemasFromClass } from "../generators/class-schema.js";
import { getSchemaExtension } from "../json-schema/types.js";
import type { JsonSchema2020 } from "../json-schema/ir-generator.js";
import type { GroupLayout } from "../ui-schema/types.js";

const fixturesDir = path.join(__dirname, "fixtures");

/**
 * Resolves a schema that may be a `$ref` into its actual definition.
 * If the schema has a `$ref`, looks up the definition in `$defs` of the root schema.
 */
function resolveRef(
  schema: JsonSchema2020 | undefined,
  root: JsonSchema2020
): JsonSchema2020 | undefined {
  if (!schema) return undefined;
  const ref = schema.$ref;
  if (ref) {
    // $ref format: "#/$defs/TypeName"
    const defName = ref.replace("#/$defs/", "");
    return root.$defs?.[defName];
  }
  return schema;
}

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

      // country: enum (IR path may omit `type` when using `enum`)
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

    // @Group and @ShowWhen decorators are not yet mapped to IR GroupLayoutNode
    // and ConditionalNode. This will be implemented when the decorator DSL is
    // fully integrated with the IR pipeline.
    it.todo("should generate correct uiSchema from built-in decorators (groups + showWhen)");
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
      expect(uiSchema.type).toBe("VerticalLayout");

      // amount: label from CustomField displayName
      const amountControl = uiSchema.elements.find(
        (e) => e.type === "Control" && e.scope === "#/properties/amount"
      );
      expect(amountControl).toMatchObject({
        type: "Control",
        scope: "#/properties/amount",
        label: "Amount",
      });

      // label: CustomField -> label in UI Schema
      const labelControl = uiSchema.elements.find(
        (e) => e.type === "Control" && e.scope === "#/properties/label"
      );
      expect(labelControl).toMatchObject({
        type: "Control",
        scope: "#/properties/label",
        label: "Label",
      });
    });
  });

  describe("Example C: Custom decorators", () => {
    // Custom decorator extension namespaces (x-formspec-*) are not yet emitted
    // by the IR JSON Schema generator. The IR pipeline supports CustomAnnotationNode
    // but the JSON Schema generator needs to map them to x-formspec-* properties.
    it.todo("should emit x-formspec-* extensions for custom decorators");
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
      const usernameControl = uiSchema.elements.find(
        (e) => e.type === "Control" && e.scope === "#/properties/username"
      );
      expect(usernameControl?.label).toBe("Username");

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
      // The address property may be a $ref to $defs
      const addressSchema = resolveRef(jsonSchema.properties?.["address"], jsonSchema);
      expect(addressSchema).toBeDefined();

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

    it("should emit a Control for nested object fields in uiSchema", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-nested-class.ts"),
        className: "UserWithAddress",
      });

      const { uiSchema } = result;
      expect(uiSchema.type).toBe("VerticalLayout");

      // Nested object fields are emitted as a single Control; nested
      // field constraints are validated via jsonSchema, not uiSchema.
      const addressControl = uiSchema.elements.find(
        (e) => e.type === "Control" && e.scope === "#/properties/address"
      );
      expect(addressControl).toMatchObject({
        type: "Control",
        scope: "#/properties/address",
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
      // Resolve potential $ref for dimensions
      const dimSchema = resolveRef(jsonSchema.properties?.["dimensions"], jsonSchema);
      expect(dimSchema).toBeDefined();

      // width has both minimum and maximum from JSDoc
      expect(dimSchema?.properties?.["width"]).toMatchObject({
        minimum: 0,
        maximum: 10000,
      });

      // depth has minimum but no maximum
      const depthSchema = dimSchema?.properties?.["depth"];
      expect(depthSchema?.minimum).toBe(0);
      expect(depthSchema?.maximum).toBeUndefined();
    });

    it("should emit a Control for nested object fields in uiSchema", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-nested-class.ts"),
        className: "ProductWithDimensions",
      });

      const { uiSchema } = result;
      expect(uiSchema.type).toBe("VerticalLayout");

      // Nested object fields are emitted as a single Control; nested
      // JSDoc constraints are validated via jsonSchema, not uiSchema.
      const dimControl = uiSchema.elements.find(
        (e) => e.type === "Control" && e.scope === "#/properties/dimensions"
      );
      expect(dimControl).toMatchObject({
        type: "Control",
        scope: "#/properties/dimensions",
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
      // Resolve potential $ref for customer
      const customerSchema = resolveRef(jsonSchema.properties?.["customer"], jsonSchema);
      expect(customerSchema).toBeDefined();

      // Level 2: customer.name has minLength
      expect(customerSchema?.properties?.["name"]).toMatchObject({
        minLength: 1,
      });

      // Level 3: customer.address.street has minLength and maxLength
      // Resolve potential $ref for address within customer
      const addressSchema = resolveRef(customerSchema?.properties?.["address"], jsonSchema);
      expect(addressSchema?.properties?.["street"]).toMatchObject({
        minLength: 1,
        maxLength: 200,
      });
    });

    it("should emit a Control for nested object fields at all nesting levels in uiSchema", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-nested-class.ts"),
        className: "Order",
      });

      const { uiSchema } = result;
      expect(uiSchema.type).toBe("VerticalLayout");

      // Nested object fields are emitted as a single Control; deep nesting
      // constraints are validated via jsonSchema, not uiSchema.
      const customerControl = uiSchema.elements.find(
        (e) => e.type === "Control" && e.scope === "#/properties/customer"
      );
      expect(customerControl).toMatchObject({
        type: "Control",
        scope: "#/properties/customer",
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

      // Sibling property exists (may be a $ref to $defs at the cycle point)
      const siblingSchema = jsonSchema.properties?.["sibling"];
      expect(siblingSchema).toBeDefined();
    });
  });

  describe("Nested class: non-class object types (regression)", () => {
    it("should handle inline object types without errors", () => {
      const result = generateSchemasFromClass({
        filePath: path.join(fixturesDir, "example-nested-class.ts"),
        className: "WithInlineObject",
      });

      const { jsonSchema } = result;
      // Resolve potential $ref for metadata
      const metadataSchema = resolveRef(jsonSchema.properties?.["metadata"], jsonSchema);

      // Structural extraction still works — key has type string
      expect(metadataSchema?.properties?.["key"]).toMatchObject({
        type: "string",
      });

      // No decorator constraints on inline object properties
      const keySchema = metadataSchema?.properties?.["key"];
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
