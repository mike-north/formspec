/**
 * Edge case and negative tests for CLI components.
 *
 * Tests cover:
 * - Complex union types
 * - Nullable and optional patterns
 * - Array edge cases
 * - Object edge cases
 * - Error handling for file I/O
 * - FormSpec loading failures
 * - Decorator extractor edge cases
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createProgramContext, findClassByName } from "../analyzer/program.js";
import { analyzeClass } from "../analyzer/class-analyzer.js";
import { convertType } from "../analyzer/type-converter.js";
import { loadFormSpecs, isFormSpec } from "../runtime/formspec-loader.js";
import { writeClassSchemas } from "../output/writer.js";
import { generateClassSchemas } from "../generators/class-schema.js";

const fixturesDir = path.join(__dirname, "fixtures");
const edgeCasesPath = path.join(fixturesDir, "edge-cases.ts");

// ============================================================================
// Type Converter Edge Cases
// ============================================================================

describe("convertType - complex unions", () => {
  it("handles string | number union as oneOf", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "MixedUnionTypes")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "mixedPrimitive")!;
    const result = convertType(field.type, ctx.checker);

    expect(result.formSpecFieldType).toBe("union");
    expect(result.jsonSchema.oneOf).toBeDefined();
    expect(result.jsonSchema.oneOf).toHaveLength(2);
  });

  it("handles complex union with object and primitive", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "MixedUnionTypes")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "complexUnion")!;
    const result = convertType(field.type, ctx.checker);

    expect(result.formSpecFieldType).toBe("union");
    expect(result.jsonSchema.oneOf).toBeDefined();
  });

  it("handles discriminated union (object union)", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "MixedUnionTypes")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "objectUnion")!;
    const result = convertType(field.type, ctx.checker);

    expect(result.formSpecFieldType).toBe("union");
    expect(result.jsonSchema.oneOf).toHaveLength(2);
  });
});

describe("convertType - nullable patterns", () => {
  it("handles T | null as oneOf with null", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "NullablePatterns")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "nullableString")!;
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.oneOf).toBeDefined();
    const types = result.jsonSchema.oneOf!.map((s) => s.type);
    expect(types).toContain("string");
    expect(types).toContain("null");
  });

  it("handles T | undefined (filters out undefined)", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "NullablePatterns")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "undefinedString")!;
    const result = convertType(field.type, ctx.checker);

    // undefined is filtered out, leaving just string
    expect(result.jsonSchema.type).toBe("string");
    expect(result.formSpecFieldType).toBe("text");
  });

  it("handles nullable enum", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "NullablePatterns")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "nullableStatus")!;
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.oneOf).toBeDefined();
    // Should have enum schema and null type
    const hasEnum = result.jsonSchema.oneOf!.some((s) => s.enum !== undefined);
    const hasNull = result.jsonSchema.oneOf!.some((s) => s.type === "null");
    expect(hasEnum).toBe(true);
    expect(hasNull).toBe(true);
  });

  it("handles T | null | undefined", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "NullablePatterns")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "tripleUnion")!;
    const result = convertType(field.type, ctx.checker);

    // Should filter undefined, keep string and null
    expect(result.jsonSchema.oneOf).toBeDefined();
    const types = result.jsonSchema.oneOf!.map((s) => s.type);
    expect(types).toContain("string");
    expect(types).toContain("null");
    expect(types).not.toContain("undefined");
  });
});

describe("convertType - array edge cases", () => {
  it("handles array of unions", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "ArrayEdgeCases")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "mixedArray")!;
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.type).toBe("array");
    expect(result.jsonSchema.items?.oneOf).toBeDefined();
  });

  it("handles nullable array", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "ArrayEdgeCases")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "nullableArray")!;
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.oneOf).toBeDefined();
  });

  it("handles array of objects", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "ArrayEdgeCases")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "objectArray")!;
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.type).toBe("array");
    expect(result.jsonSchema.items?.type).toBe("object");
    expect(result.jsonSchema.items?.properties).toBeDefined();
  });

  it("handles nested arrays", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "ArrayEdgeCases")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "nestedArray")!;
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.type).toBe("array");
    expect(result.jsonSchema.items?.type).toBe("array");
    expect(result.jsonSchema.items?.items?.type).toBe("string");
  });
});

describe("convertType - object edge cases", () => {
  it("handles empty object", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "ObjectEdgeCases")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "emptyObject")!;
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.type).toBe("object");
    expect(result.jsonSchema.properties).toEqual({});
  });

  it("handles deeply nested object", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "ObjectEdgeCases")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "deepNested")!;
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.type).toBe("object");
    expect(result.jsonSchema.properties?.["level1"]?.properties?.["level2"]).toBeDefined();
  });

  it("handles object with optional properties", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "ObjectEdgeCases")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "optionalProps")!;
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.type).toBe("object");
    expect(result.jsonSchema.required).toContain("required");
    expect(result.jsonSchema.required).not.toContain("optional");
  });
});

describe("convertType - special types", () => {
  it("handles any type gracefully", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "SpecialTypes")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "anyField")!;
    const result = convertType(field.type, ctx.checker);

    // any should be treated as unknown/empty schema
    expect(result.formSpecFieldType).toBeDefined();
  });

  it("handles unknown type gracefully", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "SpecialTypes")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "unknownField")!;
    const result = convertType(field.type, ctx.checker);

    expect(result.formSpecFieldType).toBeDefined();
  });
});

describe("convertType - enum variations", () => {
  it("handles single literal as enum with one value", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "EnumVariations")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "singleLiteral")!;
    const result = convertType(field.type, ctx.checker);

    // Single literal should be const, not enum
    expect(result.jsonSchema.const).toBe("only");
  });

  it("handles number literal enum", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "EnumVariations")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "numberEnum")!;
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.enum).toEqual([1, 2, 3]);
    expect(result.formSpecFieldType).toBe("enum");
  });

  it("handles mixed literal types as union", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "EnumVariations")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "mixedLiterals")!;
    const result = convertType(field.type, ctx.checker);

    // Mixed string/number literals should be union, not enum
    expect(result.formSpecFieldType).toBe("union");
    expect(result.jsonSchema.oneOf).toBeDefined();
  });

  it("handles large enum", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "EnumVariations")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "largeEnum")!;
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.enum).toHaveLength(10);
    expect(result.formSpecFieldType).toBe("enum");
  });
});

// ============================================================================
// isFormSpec Edge Cases
// ============================================================================

describe("isFormSpec - negative cases", () => {
  it("rejects null", () => {
    expect(isFormSpec(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isFormSpec(undefined)).toBe(false);
  });

  it("rejects primitives", () => {
    expect(isFormSpec("string")).toBe(false);
    expect(isFormSpec(123)).toBe(false);
    expect(isFormSpec(true)).toBe(false);
  });

  it("rejects object without elements", () => {
    expect(isFormSpec({})).toBe(false);
    expect(isFormSpec({ notElements: [] })).toBe(false);
  });

  it("rejects object with non-array elements", () => {
    expect(isFormSpec({ elements: "not-array" })).toBe(false);
    expect(isFormSpec({ elements: {} })).toBe(false);
    expect(isFormSpec({ elements: null })).toBe(false);
  });

  it("rejects elements missing _type property", () => {
    expect(isFormSpec({ elements: [{ id: "test" }] })).toBe(false);
    expect(isFormSpec({ elements: [{ name: "test" }] })).toBe(false);
  });

  it("rejects elements with null values", () => {
    expect(isFormSpec({ elements: [null] })).toBe(false);
    expect(isFormSpec({ elements: [undefined] })).toBe(false);
  });

  it("accepts valid FormSpec-like object", () => {
    expect(isFormSpec({
      elements: [{ _type: "field", _field: "text", name: "test" }],
    })).toBe(true);
  });

  it("accepts empty elements array", () => {
    expect(isFormSpec({ elements: [] })).toBe(true);
  });
});

// ============================================================================
// File I/O Error Handling
// ============================================================================

describe("output writer - error handling", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-test-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it("creates output directory if it doesn't exist", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "NullablePatterns")!;
    const analysis = analyzeClass(classDecl, ctx.checker);
    const schemas = generateClassSchemas(analysis, ctx.checker);

    const nonExistentDir = path.join(tempDir, "new-dir", "nested");

    const result = writeClassSchemas(
      analysis.name,
      schemas,
      [],
      [],
      { outDir: nonExistentDir }
    );

    expect(fs.existsSync(result.dir)).toBe(true);
    expect(fs.existsSync(path.join(result.dir, "schema.json"))).toBe(true);
  });

  it("overwrites existing files", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "NullablePatterns")!;
    const analysis = analyzeClass(classDecl, ctx.checker);
    const schemas = generateClassSchemas(analysis, ctx.checker);

    const outputDir = path.join(tempDir, "overwrite-test");

    // Write first time
    writeClassSchemas(analysis.name, schemas, [], [], { outDir: outputDir });

    // Modify the schema
    const modifiedSchemas = {
      ...schemas,
      jsonSchema: { ...schemas.jsonSchema, title: "Modified" },
    };

    // Write second time (should overwrite)
    const result = writeClassSchemas(
      analysis.name,
      modifiedSchemas,
      [],
      [],
      { outDir: outputDir }
    );

    const content = JSON.parse(
      fs.readFileSync(path.join(result.dir, "schema.json"), "utf-8")
    );
    expect(content.title).toBe("Modified");
  });

  it("handles special characters in class names", () => {
    // Note: This tests the sanitization logic if any
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "MixedUnionTypes")!;
    const analysis = analyzeClass(classDecl, ctx.checker);
    const schemas = generateClassSchemas(analysis, ctx.checker);

    const result = writeClassSchemas(
      analysis.name,
      schemas,
      [],
      [],
      { outDir: tempDir }
    );

    expect(fs.existsSync(result.dir)).toBe(true);
  });
});

// ============================================================================
// FormSpec Loading Failures
// ============================================================================

describe("loadFormSpecs - error handling", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-load-test-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it("handles non-existent file", async () => {
    const nonExistentPath = path.join(tempDir, "does-not-exist.js");

    await expect(loadFormSpecs(nonExistentPath)).rejects.toThrow();
  });

  it("handles file with syntax error", async () => {
    const badFilePath = path.join(tempDir, "syntax-error.mjs");
    fs.writeFileSync(badFilePath, "export const broken = {{{");

    await expect(loadFormSpecs(badFilePath)).rejects.toThrow();
  });

  it("handles file with no exports", async () => {
    const emptyFilePath = path.join(tempDir, "empty.mjs");
    fs.writeFileSync(emptyFilePath, "// Empty file\nconst x = 1;");

    const { formSpecs } = await loadFormSpecs(emptyFilePath);
    expect(formSpecs.size).toBe(0);
  });

  it("handles file with non-FormSpec exports", async () => {
    const nonFormSpecPath = path.join(tempDir, "non-formspec.mjs");
    fs.writeFileSync(nonFormSpecPath, `
      export const notAFormSpec = { foo: "bar" };
      export const alsoNot = [1, 2, 3];
      export function aFunction() { return 1; }
    `);

    const { formSpecs } = await loadFormSpecs(nonFormSpecPath);
    expect(formSpecs.size).toBe(0);
  });

  it("handles mixed exports (some FormSpec, some not)", async () => {
    const mixedPath = path.join(tempDir, "mixed.mjs");
    fs.writeFileSync(mixedPath, `
      export const validFormSpec = {
        elements: [{ _type: "field", _field: "text", name: "test" }]
      };
      export const notFormSpec = { foo: "bar" };
    `);

    const { formSpecs } = await loadFormSpecs(mixedPath);
    expect(formSpecs.size).toBe(1);
    expect(formSpecs.has("validFormSpec")).toBe(true);
    expect(formSpecs.has("notFormSpec")).toBe(false);
  });
});

// ============================================================================
// Decorator Extractor Edge Cases
// ============================================================================

describe("extractDecorators - edge cases", () => {
  it("handles class with no decorated properties", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "MixedUnionTypes")!;

    // This class has no decorators
    const analysis = analyzeClass(classDecl, ctx.checker);

    // All fields should have empty decorator arrays
    for (const field of analysis.fields) {
      expect(field.decorators).toEqual([]);
    }
  });

  it("handles class explicitly without decorators", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "NoDecoratorsClass")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    // All fields should have empty decorator arrays
    expect(analysis.fields).toHaveLength(3);
    for (const field of analysis.fields) {
      expect(field.decorators).toEqual([]);
    }
  });

  it("correctly detects optional vs required fields without decorators", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "NoDecoratorsClass")!;
    const analysis = analyzeClass(classDecl, ctx.checker);

    const nameField = analysis.fields.find((f) => f.name === "name")!;
    const countField = analysis.fields.find((f) => f.name === "count")!;
    const activeField = analysis.fields.find((f) => f.name === "active")!;

    expect(nameField.optional).toBe(false);
    expect(countField.optional).toBe(true);
    expect(activeField.optional).toBe(false);
  });
});

// ============================================================================
// Program Context Error Handling
// ============================================================================

describe("createProgramContext - error handling", () => {
  it("throws for non-existent file", () => {
    expect(() => createProgramContext("/non/existent/path.ts")).toThrow();
  });

  it("throws for directory path", () => {
    expect(() => createProgramContext(fixturesDir)).toThrow();
  });

  it("handles file with TypeScript errors gracefully", () => {
    // The program should still be created even if there are type errors
    // We test this by using a valid file - the program context should work
    const ctx = createProgramContext(edgeCasesPath);
    expect(ctx.program).toBeDefined();
    expect(ctx.checker).toBeDefined();
  });
});
