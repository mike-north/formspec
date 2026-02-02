/**
 * Tests for the codegen type generation functions.
 */

import { describe, it, expect } from "vitest";
import {
  generateCodegenOutput,
  findDecoratedClasses,
  type DecoratedClassInfo,
  type TypeMetadata,
} from "../codegen/index.js";

// =============================================================================
// Test Helpers
// =============================================================================

function createTypeMetadata(overrides: Partial<TypeMetadata> = {}): TypeMetadata {
  return {
    type: "string",
    ...overrides,
  };
}

function createDecoratedClassInfo(
  overrides: Partial<DecoratedClassInfo> = {}
): DecoratedClassInfo {
  return {
    name: "TestForm",
    sourcePath: "./test-form",
    typeMetadata: {},
    isExported: true,
    ...overrides,
  };
}

// =============================================================================
// generateCodegenOutput Tests
// =============================================================================

describe("generateCodegenOutput", () => {
  describe("schema type generation", () => {
    it("generates correct schema type for primitive fields", () => {
      const cls = createDecoratedClassInfo({
        name: "UserForm",
        typeMetadata: {
          name: createTypeMetadata({ type: "string" }),
          age: createTypeMetadata({ type: "number" }),
          active: createTypeMetadata({ type: "boolean" }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain("export type UserFormSchema = {");
      expect(output).toContain("name: string;");
      expect(output).toContain("age: number;");
      expect(output).toContain("active: boolean;");
    });

    it("generates correct schema type for optional fields", () => {
      const cls = createDecoratedClassInfo({
        name: "UserForm",
        typeMetadata: {
          name: createTypeMetadata({ type: "string" }),
          age: createTypeMetadata({ type: "number", optional: true }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain("name: string;");
      expect(output).toContain("age?: number | undefined;");
    });

    it("generates correct schema type for nullable fields", () => {
      const cls = createDecoratedClassInfo({
        name: "UserForm",
        typeMetadata: {
          middleName: createTypeMetadata({ type: "string", nullable: true }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain("middleName: string | null;");
    });

    it("generates correct schema type for nullable and optional fields", () => {
      const cls = createDecoratedClassInfo({
        name: "UserForm",
        typeMetadata: {
          nickname: createTypeMetadata({
            type: "string",
            nullable: true,
            optional: true,
          }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain("nickname?: string | null | undefined;");
    });

    it("generates correct schema type for enum fields", () => {
      const cls = createDecoratedClassInfo({
        name: "UserForm",
        typeMetadata: {
          country: createTypeMetadata({
            type: "enum",
            values: ["us", "ca", "uk"],
          }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain('country: "us" | "ca" | "uk";');
    });

    it("generates correct schema type for array fields", () => {
      const cls = createDecoratedClassInfo({
        name: "UserForm",
        typeMetadata: {
          tags: createTypeMetadata({
            type: "array",
            itemType: { type: "string" },
          }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain("tags: string[];");
    });

    it("generates correct schema type for array of nullable items", () => {
      const cls = createDecoratedClassInfo({
        name: "UserForm",
        typeMetadata: {
          values: createTypeMetadata({
            type: "array",
            itemType: { type: "string", nullable: true },
          }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain("values: (string | null)[];");
    });

    it("generates correct schema type for object fields", () => {
      const cls = createDecoratedClassInfo({
        name: "UserForm",
        typeMetadata: {
          address: createTypeMetadata({
            type: "object",
            properties: {
              street: { type: "string" },
              city: { type: "string" },
              zip: { type: "string", optional: true },
            },
          }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain(
        "address: { street: string; city: string; zip?: string | undefined };"
      );
    });
  });

  describe("property key escaping", () => {
    it("escapes property names with special characters", () => {
      const cls = createDecoratedClassInfo({
        name: "TestForm",
        typeMetadata: {
          "user-name": createTypeMetadata({ type: "string" }),
          "field with spaces": createTypeMetadata({ type: "string" }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain('"user-name": string;');
      expect(output).toContain('"field with spaces": string;');
    });

    it("escapes reserved words", () => {
      const cls = createDecoratedClassInfo({
        name: "TestForm",
        typeMetadata: {
          class: createTypeMetadata({ type: "string" }),
          function: createTypeMetadata({ type: "string" }),
          import: createTypeMetadata({ type: "string" }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain('"class": string;');
      expect(output).toContain('"function": string;');
      expect(output).toContain('"import": string;');
    });

    it("does not escape valid identifiers in schema types", () => {
      const cls = createDecoratedClassInfo({
        name: "TestForm",
        typeMetadata: {
          firstName: createTypeMetadata({ type: "string" }),
          _private: createTypeMetadata({ type: "string" }),
          $dollar: createTypeMetadata({ type: "string" }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      // Extract just the schema type section
      const schemaMatch = output.match(
        /export type TestFormSchema = \{[\s\S]*?\};/
      );
      expect(schemaMatch).not.toBeNull();
      const schemaSection = schemaMatch![0];

      // Should have unquoted identifiers in schema type
      expect(schemaSection).toContain("firstName: string;");
      expect(schemaSection).toContain("_private: string;");
      expect(schemaSection).toContain("$dollar: string;");
      // Should NOT have quotes in the schema type section
      expect(schemaSection).not.toContain('"firstName"');
      expect(schemaSection).not.toContain('"_private"');
      expect(schemaSection).not.toContain('"$dollar"');
    });
  });

  describe("typed accessor generation", () => {
    it("generates element tuple type", () => {
      const cls = createDecoratedClassInfo({
        name: "UserForm",
        typeMetadata: {
          name: createTypeMetadata({ type: "string" }),
          age: createTypeMetadata({ type: "number", optional: true }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain("export type UserFormElements = readonly [");
      expect(output).toContain(
        '{ readonly _field: "text"; readonly id: "name"; readonly required: true }'
      );
      expect(output).toContain(
        '{ readonly _field: "number"; readonly id: "age"; readonly required: false }'
      );
    });

    it("generates enum options in element type", () => {
      const cls = createDecoratedClassInfo({
        name: "UserForm",
        typeMetadata: {
          status: createTypeMetadata({
            type: "enum",
            values: ["active", "inactive"],
          }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain('readonly options: readonly ["active", "inactive"]');
    });

    it("generates FormSpec type alias", () => {
      const cls = createDecoratedClassInfo({
        name: "UserForm",
        typeMetadata: {
          name: createTypeMetadata({ type: "string" }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain(
        "export type UserFormFormSpec = { readonly elements: UserFormElements };"
      );
    });

    it("generates typed accessor function", () => {
      const cls = createDecoratedClassInfo({
        name: "UserForm",
        typeMetadata: {
          name: createTypeMetadata({ type: "string" }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain(
        "export function getUserFormFormSpec(): UserFormFormSpec {"
      );
      expect(output).toContain(
        "return toFormSpec(UserForm) as unknown as UserFormFormSpec;"
      );
    });
  });

  describe("multiple classes", () => {
    it("generates types for multiple classes", () => {
      const classes = [
        createDecoratedClassInfo({
          name: "UserForm",
          typeMetadata: { name: createTypeMetadata({ type: "string" }) },
        }),
        createDecoratedClassInfo({
          name: "ProductForm",
          sourcePath: "./product",
          typeMetadata: { price: createTypeMetadata({ type: "number" }) },
        }),
      ];

      const output = generateCodegenOutput(classes, "/tmp/out.ts", "/tmp");

      expect(output).toContain("export type UserFormSchema = {");
      expect(output).toContain("export type ProductFormSchema = {");
      expect(output).toContain("export function getUserFormFormSpec()");
      expect(output).toContain("export function getProductFormFormSpec()");
    });
  });

  describe("edge cases", () => {
    it("handles empty enum values array", () => {
      const cls = createDecoratedClassInfo({
        name: "TestForm",
        typeMetadata: {
          status: createTypeMetadata({ type: "enum", values: [] }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      // Should fall back to string type
      expect(output).toContain("status: string;");
    });

    it("handles unknown type", () => {
      const cls = createDecoratedClassInfo({
        name: "TestForm",
        typeMetadata: {
          data: createTypeMetadata({ type: "unknown" }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain("data: unknown;");
    });

    it("handles array without itemType", () => {
      const cls = createDecoratedClassInfo({
        name: "TestForm",
        typeMetadata: {
          items: createTypeMetadata({ type: "array" }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain("items: unknown[];");
    });

    it("handles object without properties", () => {
      const cls = createDecoratedClassInfo({
        name: "TestForm",
        typeMetadata: {
          data: createTypeMetadata({ type: "object" }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain("data: Record<string, unknown>;");
    });

    it("handles number enum values", () => {
      const cls = createDecoratedClassInfo({
        name: "TestForm",
        typeMetadata: {
          priority: createTypeMetadata({
            type: "enum",
            values: [1, 2, 3],
          }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain("priority: 1 | 2 | 3;");
    });

    it("handles enum values with special characters (quotes, backslashes)", () => {
      const cls = createDecoratedClassInfo({
        name: "TestForm",
        typeMetadata: {
          weird: createTypeMetadata({
            type: "enum",
            values: ['foo"bar', "back\\slash", "new\nline"],
          }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      // JSON.stringify escapes these properly
      expect(output).toContain('"foo\\"bar"');
      expect(output).toContain('"back\\\\slash"');
      expect(output).toContain('"new\\nline"');
    });

    it("handles property names with special characters (quotes, newlines)", () => {
      const cls = createDecoratedClassInfo({
        name: "TestForm",
        typeMetadata: {
          'key"with"quotes': createTypeMetadata({ type: "string" }),
          "key\nwith\nnewlines": createTypeMetadata({ type: "string" }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      // JSON.stringify escapes these properly
      expect(output).toContain('"key\\"with\\"quotes": string;');
      expect(output).toContain('"key\\nwith\\nnewlines": string;');
    });

    it("escapes additional reserved words (async, await, null, true, false)", () => {
      const cls = createDecoratedClassInfo({
        name: "TestForm",
        typeMetadata: {
          async: createTypeMetadata({ type: "string" }),
          await: createTypeMetadata({ type: "string" }),
          null: createTypeMetadata({ type: "string" }),
          true: createTypeMetadata({ type: "boolean" }),
          get: createTypeMetadata({ type: "string" }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      // Extract just the schema type section
      const schemaMatch = output.match(
        /export type TestFormSchema = \{[\s\S]*?\};/
      );
      expect(schemaMatch).not.toBeNull();
      const schemaSection = schemaMatch![0];

      expect(schemaSection).toContain('"async": string;');
      expect(schemaSection).toContain('"await": string;');
      expect(schemaSection).toContain('"null": string;');
      expect(schemaSection).toContain('"true": boolean;');
      expect(schemaSection).toContain('"get": string;');
    });

    it("handles deeply nested objects (3+ levels)", () => {
      const cls = createDecoratedClassInfo({
        name: "NestedForm",
        typeMetadata: {
          data: createTypeMetadata({
            type: "object",
            properties: {
              level1: {
                type: "object",
                properties: {
                  level2: {
                    type: "object",
                    properties: {
                      value: { type: "string" },
                    },
                  },
                },
              },
            },
          }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain(
        "data: { level1: { level2: { value: string } } };"
      );
    });

    it("handles arrays of objects with nested properties", () => {
      const cls = createDecoratedClassInfo({
        name: "ArrayForm",
        typeMetadata: {
          items: createTypeMetadata({
            type: "array",
            itemType: {
              type: "object",
              properties: {
                nested: {
                  type: "object",
                  properties: {
                    value: { type: "number" },
                  },
                },
              },
            },
          }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain("items: { nested: { value: number } }[];");
    });
  });

  describe("negative tests and error handling", () => {
    it("handles empty class list", () => {
      const output = generateCodegenOutput([], "/tmp/out.ts", "/tmp");

      // Should still generate valid structure with no class-specific code
      expect(output).toContain("Auto-generated by FormSpec CLI");
      expect(output).toContain('import { toFormSpec } from "@formspec/decorators";');
      expect(output).toContain("// Type Metadata Patches");
      expect(output).toContain("// Inferred Schema Types");
    });

    it("handles class with no fields", () => {
      const cls = createDecoratedClassInfo({
        name: "EmptyForm",
        typeMetadata: {},
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      // Should generate empty schema type
      expect(output).toContain("export type EmptyFormSchema = {");
      // Elements should be empty tuple
      expect(output).toContain("export type EmptyFormElements = readonly [");
    });

    it("handles optional nullable array of objects", () => {
      const cls = createDecoratedClassInfo({
        name: "ComplexForm",
        typeMetadata: {
          items: createTypeMetadata({
            type: "array",
            optional: true,
            nullable: true,
            itemType: {
              type: "object",
              properties: {
                id: { type: "string" },
              },
            },
          }),
        },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain("items?: { id: string }[] | null | undefined;");
    });
  });

  describe("unexported class detection", () => {
    it("should track isExported status", () => {
      const exportedClass = createDecoratedClassInfo({
        name: "ExportedForm",
        isExported: true,
        typeMetadata: { name: createTypeMetadata({ type: "string" }) },
      });

      const unexportedClass = createDecoratedClassInfo({
        name: "UnexportedForm",
        isExported: false,
        typeMetadata: { name: createTypeMetadata({ type: "string" }) },
      });

      expect(exportedClass.isExported).toBe(true);
      expect(unexportedClass.isExported).toBe(false);
    });
  });

  describe("imports and structure", () => {
    it("imports toFormSpec from decorators", () => {
      const cls = createDecoratedClassInfo({
        name: "TestForm",
        typeMetadata: { name: createTypeMetadata({ type: "string" }) },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain(
        'import { toFormSpec } from "@formspec/decorators";'
      );
    });

    it("includes section separators", () => {
      const cls = createDecoratedClassInfo({
        name: "TestForm",
        typeMetadata: { name: createTypeMetadata({ type: "string" }) },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain("// Type Metadata Patches");
      expect(output).toContain("// Inferred Schema Types");
      expect(output).toContain("// Type-Safe FormSpec Accessors");
    });

    it("includes header comment with usage instructions", () => {
      const cls = createDecoratedClassInfo({
        name: "TestForm",
        typeMetadata: { name: createTypeMetadata({ type: "string" }) },
      });

      const output = generateCodegenOutput([cls], "/tmp/out.ts", "/tmp");

      expect(output).toContain("Auto-generated by FormSpec CLI");
      expect(output).toContain("DO NOT EDIT");
    });
  });
});
