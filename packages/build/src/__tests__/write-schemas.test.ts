import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { writeSchemas } from "../index.js";
import { formspec, field, group } from "@formspec/dsl";
import type { JSONSchema7 } from "../json-schema/types.js";
import type { UISchema } from "../ui-schema/types.js";

describe("writeSchemas", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-test-"));
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  // Positive tests
  describe("positive cases", () => {
    it("should write both schema files to specified directory", () => {
      const form = formspec(
        field.text("name", { required: true }),
        field.number("age"),
      );

      const result = writeSchemas(form, {
        outDir: tempDir,
        name: "test",
      });

      expect(fs.existsSync(result.jsonSchemaPath)).toBe(true);
      expect(fs.existsSync(result.uiSchemaPath)).toBe(true);
      expect(result.jsonSchemaPath).toBe(path.join(tempDir, "test-schema.json"));
      expect(result.uiSchemaPath).toBe(path.join(tempDir, "test-uischema.json"));
    });

    it("should create output directory if it doesn't exist", () => {
      const form = formspec(field.text("name"));
      const nestedDir = path.join(tempDir, "nested", "deeply", "output");

      expect(fs.existsSync(nestedDir)).toBe(false);

      writeSchemas(form, {
        outDir: nestedDir,
        name: "test",
      });

      expect(fs.existsSync(nestedDir)).toBe(true);
    });

    it("should use 'schema' as default name when not provided", () => {
      const form = formspec(field.text("name"));

      const result = writeSchemas(form, {
        outDir: tempDir,
      });

      expect(result.jsonSchemaPath).toBe(path.join(tempDir, "schema-schema.json"));
      expect(result.uiSchemaPath).toBe(path.join(tempDir, "schema-uischema.json"));
    });

    it("should use custom indentation when provided", () => {
      const form = formspec(field.text("name"));

      writeSchemas(form, {
        outDir: tempDir,
        name: "test",
        indent: 4,
      });

      const content = fs.readFileSync(path.join(tempDir, "test-schema.json"), "utf-8");
      // With indent 4, we should see 4-space indentation
      expect(content).toContain("    "); // 4 spaces
    });

    it("should generate valid JSON files that can be parsed", () => {
      const form = formspec(
        field.text("name"),
        field.enum("status", ["draft", "active"]),
      );

      const result = writeSchemas(form, {
        outDir: tempDir,
        name: "test",
      });

      const jsonSchema = JSON.parse(fs.readFileSync(result.jsonSchemaPath, "utf-8")) as JSONSchema7;
      const uiSchema = JSON.parse(fs.readFileSync(result.uiSchemaPath, "utf-8")) as UISchema;

      expect(jsonSchema).toHaveProperty("type", "object");
      expect(jsonSchema).toHaveProperty("properties");
      expect(uiSchema).toHaveProperty("type");
    });

    it("should generate correct schema content matching buildFormSchemas output", () => {
      const form = formspec(
        group("Info",
          field.text("name", { label: "Name", required: true }),
          field.number("age", { label: "Age", min: 0 }),
        ),
      );

      const result = writeSchemas(form, {
        outDir: tempDir,
        name: "test",
      });

      const jsonSchema = JSON.parse(fs.readFileSync(result.jsonSchemaPath, "utf-8")) as JSONSchema7;

      expect(jsonSchema.properties).toHaveProperty("name");
      expect(jsonSchema.properties).toHaveProperty("age");
      expect(jsonSchema.required).toContain("name");
      expect(jsonSchema.properties?.["age"]).toHaveProperty("minimum", 0);
    });

    it("should handle forms with enum fields", () => {
      const form = formspec(
        field.enum("status", ["draft", "published", "archived"]),
      );

      const result = writeSchemas(form, {
        outDir: tempDir,
        name: "test",
      });

      const jsonSchema = JSON.parse(fs.readFileSync(result.jsonSchemaPath, "utf-8")) as JSONSchema7;

      const statusProperty = jsonSchema.properties?.["status"];
      expect(statusProperty).toHaveProperty("enum");
      expect(statusProperty?.enum).toEqual(["draft", "published", "archived"]);
    });

    it("should handle forms with nested objects", () => {
      const form = formspec(
        field.object("address",
          field.text("street"),
          field.text("city"),
        ),
      );

      const result = writeSchemas(form, {
        outDir: tempDir,
        name: "test",
      });

      const jsonSchema = JSON.parse(fs.readFileSync(result.jsonSchemaPath, "utf-8")) as JSONSchema7;

      const addressProperty = jsonSchema.properties?.["address"];
      expect(addressProperty).toHaveProperty("type", "object");
      expect(addressProperty?.properties).toHaveProperty("street");
      expect(addressProperty?.properties).toHaveProperty("city");
    });

    it("should handle forms with arrays", () => {
      const form = formspec(
        field.array("items",
          field.text("name"),
          field.number("quantity"),
        ),
      );

      const result = writeSchemas(form, {
        outDir: tempDir,
        name: "test",
      });

      const jsonSchema = JSON.parse(fs.readFileSync(result.jsonSchemaPath, "utf-8")) as JSONSchema7;

      expect(jsonSchema.properties?.["items"]).toHaveProperty("type", "array");
      expect(jsonSchema.properties?.["items"]).toHaveProperty("items");
    });
  });

  // Negative tests
  describe("negative cases", () => {
    it("should overwrite existing files", () => {
      const form1 = formspec(field.text("original"));
      const form2 = formspec(field.text("updated"));

      // Write first version
      writeSchemas(form1, {
        outDir: tempDir,
        name: "test",
      });

      // Write second version
      const result = writeSchemas(form2, {
        outDir: tempDir,
        name: "test",
      });

      const jsonSchema = JSON.parse(fs.readFileSync(result.jsonSchemaPath, "utf-8")) as JSONSchema7;
      expect(jsonSchema.properties).toHaveProperty("updated");
      expect(jsonSchema.properties).not.toHaveProperty("original");
    });

    it("should handle empty forms", () => {
      const form = formspec();

      const result = writeSchemas(form, {
        outDir: tempDir,
        name: "empty",
      });

      expect(fs.existsSync(result.jsonSchemaPath)).toBe(true);
      const jsonSchema = JSON.parse(fs.readFileSync(result.jsonSchemaPath, "utf-8")) as JSONSchema7;
      expect(jsonSchema).toHaveProperty("type", "object");
    });

    it("should handle forms with special characters in field names", () => {
      const form = formspec(
        field.text("field-with-dashes"),
        field.text("field_with_underscores"),
      );

      const result = writeSchemas(form, {
        outDir: tempDir,
        name: "test",
      });

      const jsonSchema = JSON.parse(fs.readFileSync(result.jsonSchemaPath, "utf-8")) as JSONSchema7;
      expect(jsonSchema.properties).toHaveProperty("field-with-dashes");
      expect(jsonSchema.properties).toHaveProperty("field_with_underscores");
    });

    it("should handle output directory with trailing slash", () => {
      const form = formspec(field.text("name"));

      const result = writeSchemas(form, {
        outDir: tempDir + "/",
        name: "test",
      });

      expect(fs.existsSync(result.jsonSchemaPath)).toBe(true);
    });
  });

  // Edge cases
  describe("edge cases", () => {
    it("should handle name with dots", () => {
      const form = formspec(field.text("name"));

      const result = writeSchemas(form, {
        outDir: tempDir,
        name: "my.form.v1",
      });

      expect(result.jsonSchemaPath).toBe(path.join(tempDir, "my.form.v1-schema.json"));
    });

    it("should return absolute paths", () => {
      const form = formspec(field.text("name"));

      const result = writeSchemas(form, {
        outDir: tempDir,
        name: "test",
      });

      expect(path.isAbsolute(result.jsonSchemaPath)).toBe(true);
      expect(path.isAbsolute(result.uiSchemaPath)).toBe(true);
    });

    it("should handle zero indent (compact JSON)", () => {
      const form = formspec(field.text("name"));

      writeSchemas(form, {
        outDir: tempDir,
        name: "test",
        indent: 0,
      });

      const content = fs.readFileSync(path.join(tempDir, "test-schema.json"), "utf-8");
      // With indent 0, JSON should be on one line (no newlines except at end)
      expect(content.split("\n").length).toBeLessThanOrEqual(2);
    });
  });
});
