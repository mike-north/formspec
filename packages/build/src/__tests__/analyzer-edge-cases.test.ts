/**
 * Edge case and negative tests for analysis and generation components.
 *
 * Tests cover:
 * - Complex union types
 * - Nullable and optional patterns
 * - Array edge cases
 * - Object edge cases
 * - Decorator extractor edge cases
 * - Program context error handling
 */

import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { createProgramContext, findClassByName } from "../analyzer/program.js";
import { analyzeClass } from "../analyzer/class-analyzer.js";
import { convertType } from "../analyzer/type-converter.js";
import type { ExtendedJSONSchema7 } from "../json-schema/types.js";

const fixturesDir = path.join(__dirname, "fixtures");
const edgeCasesPath = path.join(fixturesDir, "edge-cases.ts");

// ============================================================================
// Type Converter Edge Cases
// ============================================================================

describe("convertType - complex unions", () => {
  it("handles string | number union as oneOf", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "MixedUnionTypes");
    if (!classDecl) throw new Error("MixedUnionTypes class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "mixedPrimitive");
    if (!field) throw new Error("mixedPrimitive field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.formSpecFieldType).toBe("union");
    expect(result.jsonSchema.oneOf).toBeDefined();
    expect(result.jsonSchema.oneOf).toHaveLength(2);
  });

  it("handles complex union with object and primitive", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "MixedUnionTypes");
    if (!classDecl) throw new Error("MixedUnionTypes class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "complexUnion");
    if (!field) throw new Error("complexUnion field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.formSpecFieldType).toBe("union");
    expect(result.jsonSchema.oneOf).toBeDefined();
  });

  it("handles discriminated union (object union)", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "MixedUnionTypes");
    if (!classDecl) throw new Error("MixedUnionTypes class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "objectUnion");
    if (!field) throw new Error("objectUnion field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.formSpecFieldType).toBe("union");
    expect(result.jsonSchema.oneOf).toHaveLength(2);
  });
});

describe("convertType - nullable patterns", () => {
  it("handles T | null as oneOf with null", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "NullablePatterns");
    if (!classDecl) throw new Error("NullablePatterns class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "nullableString");
    if (!field) throw new Error("nullableString field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.oneOf).toBeDefined();
    if (!result.jsonSchema.oneOf) throw new Error("oneOf not defined");
    const types = result.jsonSchema.oneOf.map((s) => s.type);
    expect(types).toContain("string");
    expect(types).toContain("null");
  });

  it("handles T | undefined (filters out undefined)", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "NullablePatterns");
    if (!classDecl) throw new Error("NullablePatterns class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "undefinedString");
    if (!field) throw new Error("undefinedString field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.type).toBe("string");
    expect(result.formSpecFieldType).toBe("text");
  });

  it("handles nullable enum", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "NullablePatterns");
    if (!classDecl) throw new Error("NullablePatterns class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "nullableStatus");
    if (!field) throw new Error("nullableStatus field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.oneOf).toBeDefined();
    if (!result.jsonSchema.oneOf) throw new Error("oneOf not defined");
    const hasEnum = result.jsonSchema.oneOf.some((s) => s.enum !== undefined);
    const hasNull = result.jsonSchema.oneOf.some((s) => s.type === "null");
    expect(hasEnum).toBe(true);
    expect(hasNull).toBe(true);
  });

  it("handles T | null | undefined", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "NullablePatterns");
    if (!classDecl) throw new Error("NullablePatterns class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "tripleUnion");
    if (!field) throw new Error("tripleUnion field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.oneOf).toBeDefined();
    if (!result.jsonSchema.oneOf) throw new Error("oneOf not defined");
    const types = result.jsonSchema.oneOf.map((s) => s.type);
    expect(types).toContain("string");
    expect(types).toContain("null");
    expect(types).not.toContain("undefined");
  });
});

describe("convertType - array edge cases", () => {
  it("handles array of unions", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "ArrayEdgeCases");
    if (!classDecl) throw new Error("ArrayEdgeCases class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "mixedArray");
    if (!field) throw new Error("mixedArray field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.type).toBe("array");
    // convertType always produces a single items schema, not a tuple
    const items = result.jsonSchema.items as ExtendedJSONSchema7 | undefined;
    expect(items?.oneOf).toBeDefined();
  });

  it("handles nullable array", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "ArrayEdgeCases");
    if (!classDecl) throw new Error("ArrayEdgeCases class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "nullableArray");
    if (!field) throw new Error("nullableArray field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.oneOf).toBeDefined();
  });

  it("handles array of objects", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "ArrayEdgeCases");
    if (!classDecl) throw new Error("ArrayEdgeCases class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "objectArray");
    if (!field) throw new Error("objectArray field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.type).toBe("array");
    // convertType always produces a single items schema, not a tuple
    const items = result.jsonSchema.items as ExtendedJSONSchema7 | undefined;
    expect(items?.type).toBe("object");
    expect(items?.properties).toBeDefined();
  });

  it("handles nested arrays", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "ArrayEdgeCases");
    if (!classDecl) throw new Error("ArrayEdgeCases class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "nestedArray");
    if (!field) throw new Error("nestedArray field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.type).toBe("array");
    // convertType always produces a single items schema, not a tuple
    const items = result.jsonSchema.items as ExtendedJSONSchema7 | undefined;
    expect(items?.type).toBe("array");
    const nestedItems = items?.items as ExtendedJSONSchema7 | undefined;
    expect(nestedItems?.type).toBe("string");
  });
});

describe("convertType - object edge cases", () => {
  it("handles empty object", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "ObjectEdgeCases");
    if (!classDecl) throw new Error("ObjectEdgeCases class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "emptyObject");
    if (!field) throw new Error("emptyObject field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.type).toBe("object");
    expect(result.jsonSchema.properties).toEqual({});
  });

  it("handles deeply nested object", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "ObjectEdgeCases");
    if (!classDecl) throw new Error("ObjectEdgeCases class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "deepNested");
    if (!field) throw new Error("deepNested field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.type).toBe("object");
    expect(result.jsonSchema.properties?.["level1"]?.properties?.["level2"]).toBeDefined();
  });

  it("handles object with optional properties", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "ObjectEdgeCases");
    if (!classDecl) throw new Error("ObjectEdgeCases class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "optionalProps");
    if (!field) throw new Error("optionalProps field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.type).toBe("object");
    expect(result.jsonSchema.required).toContain("required");
    expect(result.jsonSchema.required).not.toContain("optional");
  });
});

describe("convertType - special types", () => {
  it("handles any type gracefully", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "SpecialTypes");
    if (!classDecl) throw new Error("SpecialTypes class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "anyField");
    if (!field) throw new Error("anyField field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.formSpecFieldType).toBeDefined();
  });

  it("handles unknown type gracefully", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "SpecialTypes");
    if (!classDecl) throw new Error("SpecialTypes class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "unknownField");
    if (!field) throw new Error("unknownField field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.formSpecFieldType).toBeDefined();
  });
});

describe("convertType - enum variations", () => {
  it("handles single literal as enum with one value", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "EnumVariations");
    if (!classDecl) throw new Error("EnumVariations class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "singleLiteral");
    if (!field) throw new Error("singleLiteral field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.const).toBe("only");
  });

  it("handles number literal enum", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "EnumVariations");
    if (!classDecl) throw new Error("EnumVariations class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "numberEnum");
    if (!field) throw new Error("numberEnum field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.enum).toEqual([1, 2, 3]);
    expect(result.formSpecFieldType).toBe("enum");
  });

  it("handles mixed literal types as union", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "EnumVariations");
    if (!classDecl) throw new Error("EnumVariations class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "mixedLiterals");
    if (!field) throw new Error("mixedLiterals field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.formSpecFieldType).toBe("union");
    expect(result.jsonSchema.oneOf).toBeDefined();
  });

  it("handles large enum", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "EnumVariations");
    if (!classDecl) throw new Error("EnumVariations class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const field = analysis.fields.find((f) => f.name === "largeEnum");
    if (!field) throw new Error("largeEnum field not found");
    const result = convertType(field.type, ctx.checker);

    expect(result.jsonSchema.enum).toHaveLength(10);
    expect(result.formSpecFieldType).toBe("enum");
  });
});

// ============================================================================
// Decorator Extractor Edge Cases
// ============================================================================

describe("extractDecorators - edge cases", () => {
  it("handles class with no decorated properties", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "MixedUnionTypes");
    if (!classDecl) throw new Error("MixedUnionTypes class not found");

    const analysis = analyzeClass(classDecl, ctx.checker);

    for (const field of analysis.fields) {
      expect(field.decorators).toEqual([]);
    }
  });

  it("handles class explicitly without decorators", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "NoDecoratorsClass");
    if (!classDecl) throw new Error("NoDecoratorsClass class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    expect(analysis.fields).toHaveLength(3);
    for (const field of analysis.fields) {
      expect(field.decorators).toEqual([]);
    }
  });

  it("correctly detects optional vs required fields without decorators", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "NoDecoratorsClass");
    if (!classDecl) throw new Error("NoDecoratorsClass class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const nameField = analysis.fields.find((f) => f.name === "name");
    if (!nameField) throw new Error("name field not found");
    const countField = analysis.fields.find((f) => f.name === "count");
    if (!countField) throw new Error("count field not found");
    const activeField = analysis.fields.find((f) => f.name === "active");
    if (!activeField) throw new Error("active field not found");

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
    const ctx = createProgramContext(edgeCasesPath);
    expect(ctx.program).toBeDefined();
    expect(ctx.checker).toBeDefined();
  });
});
