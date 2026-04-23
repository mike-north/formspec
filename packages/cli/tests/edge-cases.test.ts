/**
 * Edge case and negative tests for CLI-specific components.
 *
 * Tests cover:
 * - isFormSpec detection edge cases
 * - File I/O error handling (output writer)
 * - FormSpec loading failures
 *
 * Note: Analysis and generation edge cases are tested in @formspec/build.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  createProgramContext,
  findClassByName,
  analyzeClassToIR,
  generateClassSchemas,
} from "@formspec/build/internals";
import { loadFormSpecs, isFormSpec } from "../src/runtime/formspec-loader.js";
import { writeClassSchemas } from "../src/output/writer.js";

const fixturesDir = path.join(__dirname, "fixtures");
const edgeCasesPath = path.join(fixturesDir, "edge-cases.ts");

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
    expect(
      isFormSpec({
        elements: [{ _type: "field", _field: "text", name: "test" }],
      })
    ).toBe(true);
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
    const classDecl = findClassByName(ctx.sourceFile, "NullablePatterns");
    if (!classDecl) throw new Error("NullablePatterns class not found");
    const analysis = analyzeClassToIR(classDecl, ctx.checker, edgeCasesPath);
    const schemas = generateClassSchemas(analysis, { file: edgeCasesPath });

    const nonExistentDir = path.join(tempDir, "new-dir", "nested");

    const result = writeClassSchemas(analysis.name, schemas, [], [], { outDir: nonExistentDir });

    expect(fs.existsSync(result.dir)).toBe(true);
    expect(fs.existsSync(path.join(result.dir, "schema.json"))).toBe(true);
  });

  it("overwrites existing files", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "NullablePatterns");
    if (!classDecl) throw new Error("NullablePatterns class not found");
    const analysis = analyzeClassToIR(classDecl, ctx.checker, edgeCasesPath);
    const schemas = generateClassSchemas(analysis, { file: edgeCasesPath });

    const outputDir = path.join(tempDir, "overwrite-test");

    // Write first time
    writeClassSchemas(analysis.name, schemas, [], [], { outDir: outputDir });

    // Modify the schema
    const modifiedSchemas = {
      ...schemas,
      jsonSchema: { ...schemas.jsonSchema, title: "Modified" },
    };

    // Write second time (should overwrite)
    const result = writeClassSchemas(analysis.name, modifiedSchemas, [], [], { outDir: outputDir });

    const content: unknown = JSON.parse(
      fs.readFileSync(path.join(result.dir, "schema.json"), "utf-8")
    );
    expect((content as { title: string }).title).toBe("Modified");
  });

  it("handles special characters in class names", () => {
    const ctx = createProgramContext(edgeCasesPath);
    const classDecl = findClassByName(ctx.sourceFile, "MixedUnionTypes");
    if (!classDecl) throw new Error("MixedUnionTypes class not found");
    const analysis = analyzeClassToIR(classDecl, ctx.checker, edgeCasesPath);
    const schemas = generateClassSchemas(analysis, { file: edgeCasesPath });

    const result = writeClassSchemas(analysis.name, schemas, [], [], { outDir: tempDir });

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
    fs.writeFileSync(
      nonFormSpecPath,
      `
      export const notAFormSpec = { foo: "bar" };
      export const alsoNot = [1, 2, 3];
      export function aFunction() { return 1; }
    `
    );

    const { formSpecs } = await loadFormSpecs(nonFormSpecPath);
    expect(formSpecs.size).toBe(0);
  });

  it("handles mixed exports (some FormSpec, some not)", async () => {
    const mixedPath = path.join(tempDir, "mixed.mjs");
    fs.writeFileSync(
      mixedPath,
      `
      export const validFormSpec = {
        elements: [{ _type: "field", _field: "text", name: "test" }]
      };
      export const notFormSpec = { foo: "bar" };
    `
    );

    const { formSpecs } = await loadFormSpecs(mixedPath);
    expect(formSpecs.size).toBe(1);
    expect(formSpecs.has("validFormSpec")).toBe(true);
    expect(formSpecs.has("notFormSpec")).toBe(false);
  });
});
