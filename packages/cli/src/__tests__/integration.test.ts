/**
 * Integration tests for the CLI workflow.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  createProgramContext,
  findClassByName,
  analyzeClass,
  generateClassSchemas,
  generateMethodSchemas,
  collectFormSpecReferences,
} from "@formspec/build/internals";
import type { LoadedFormSpecSchemas } from "@formspec/build/internals";
import { loadFormSpecs, isFormSpec } from "../runtime/formspec-loader.js";
import { writeClassSchemas, writeFormSpecSchemas } from "../output/writer.js";

const fixturesDir = path.join(__dirname, "fixtures");
const sampleFormsPath = path.join(fixturesDir, "sample-forms.ts");
const compiledPath = path.join(fixturesDir, "sample-forms.js");
const testOutputDir = path.join(__dirname, "__test_output__");

// Check if compiled fixture exists (may need to be built)
const hasCompiledFixture = fs.existsSync(compiledPath);

/**
 * Converts FormSpecSchemas from loader to LoadedFormSpecSchemas for build API.
 */
function toLoadedSchemas(
  formSpecs: Map<string, { name: string; jsonSchema: unknown; uiSchema: unknown }>
): Map<string, LoadedFormSpecSchemas> {
  const result = new Map<string, LoadedFormSpecSchemas>();
  for (const [name, schemas] of formSpecs) {
    result.set(name, {
      name: schemas.name,
      jsonSchema: schemas.jsonSchema,
      uiSchema: schemas.uiSchema,
    });
  }
  return result;
}

describe("generators", () => {
  it("generates class schemas from static analysis", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "SimpleProduct");
    if (!classDecl) throw new Error("SimpleProduct class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);
    const schemas = generateClassSchemas(analysis, ctx.checker);

    // JSON Schema
    expect(schemas.jsonSchema.type).toBe("object");
    expect(schemas.jsonSchema.properties).toBeDefined();
    expect(schemas.jsonSchema.properties?.["name"]).toBeDefined();
    expect(schemas.jsonSchema.properties?.["price"]).toBeDefined();
    expect(schemas.jsonSchema.required).toContain("name");
    expect(schemas.jsonSchema.required).toContain("active");
    expect(schemas.jsonSchema.required).not.toContain("price");

    // UI Schema
    expect(schemas.uiSchema.elements).toHaveLength(4);
    const nameElement = schemas.uiSchema.elements.find((e) => e.id === "name");
    expect(nameElement?._field).toBe("text");
    expect(nameElement?.required).toBe(true);
  });

  it("collects FormSpec references from methods", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "InstallmentPlan");
    if (!classDecl) throw new Error("InstallmentPlan class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const refs = collectFormSpecReferences([
      ...analysis.instanceMethods,
      ...analysis.staticMethods,
    ]);

    expect(refs.size).toBe(2);
    expect(refs.has("ActivateParams")).toBe(true);
    expect(refs.has("CancelParams")).toBe(true);
  });

  it("generates method schemas without FormSpec (static only)", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "SimpleProduct");
    if (!classDecl) throw new Error("SimpleProduct class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const updateMethod = analysis.instanceMethods[0];
    if (!updateMethod) throw new Error("updateMethod not found");
    const methodSchemas = generateMethodSchemas(updateMethod, ctx.checker, new Map());

    expect(methodSchemas.name).toBe("update");
    expect(methodSchemas.params).not.toBeNull();
    expect(methodSchemas.params?.jsonSchema.type).toBe("object");
    expect(methodSchemas.params?.uiSchema).toBeNull();
    expect(methodSchemas.returnType.type).toBe("boolean");
  });
});

describe("isFormSpec", () => {
  it("detects valid FormSpec-like objects", () => {
    const validFormSpec = {
      elements: [{ _type: "field", _field: "text", name: "test" }],
    };

    expect(isFormSpec(validFormSpec)).toBe(true);
  });

  it("rejects invalid objects", () => {
    expect(isFormSpec(null)).toBe(false);
    expect(isFormSpec(undefined)).toBe(false);
    expect(isFormSpec({})).toBe(false);
    expect(isFormSpec({ elements: "not-array" })).toBe(false);
    expect(isFormSpec({ elements: [{ noType: true }] })).toBe(false);
  });
});

describe.skipIf(!hasCompiledFixture)("runtime loading", () => {
  it("loads FormSpec exports from compiled module", async () => {
    const { formSpecs, module } = await loadFormSpecs(compiledPath);

    // Should find our exported FormSpecs
    expect(formSpecs.size).toBeGreaterThan(0);
    expect(formSpecs.has("UserRegistrationForm")).toBe(true);
    expect(formSpecs.has("ProductConfigForm")).toBe(true);
    expect(formSpecs.has("ActivateParams")).toBe(true);
    expect(formSpecs.has("CancelParams")).toBe(true);

    // Check generated schemas
    const userForm = formSpecs.get("UserRegistrationForm");
    if (!userForm) throw new Error("UserRegistrationForm not found");
    expect(userForm.jsonSchema).toBeDefined();
    expect(userForm.uiSchema).toBeDefined();

    // Module should have the class exports too
    expect(module["InstallmentPlan"]).toBeDefined();
  });

  it("generates method schemas with FormSpec params", async () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "InstallmentPlan");
    if (!classDecl) throw new Error("InstallmentPlan class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    // Load FormSpecs at runtime
    const { formSpecs } = await loadFormSpecs(compiledPath);
    const loadedSchemas = toLoadedSchemas(formSpecs);

    // Generate method schemas
    const activateMethod = analysis.instanceMethods.find((m) => m.name === "activate");
    if (!activateMethod) throw new Error("activate method not found");
    const methodSchemas = generateMethodSchemas(activateMethod, ctx.checker, loadedSchemas);

    expect(methodSchemas.name).toBe("activate");
    expect(methodSchemas.params).not.toBeNull();
    expect(methodSchemas.params?.formSpecExport).toBe("ActivateParams");
    // Should have UI Schema from the FormSpec
    expect(methodSchemas.params?.uiSchema).not.toBeNull();
  });
});

describe.skipIf(!hasCompiledFixture)("output writer", () => {
  beforeAll(() => {
    // Clean up test output directory
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test output directory
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true });
    }
  });

  it("writes class schemas to output directory", async () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "InstallmentPlan");
    if (!classDecl) throw new Error("InstallmentPlan class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    // Load FormSpecs
    const { formSpecs } = await loadFormSpecs(compiledPath);
    const loadedSchemas = toLoadedSchemas(formSpecs);

    // Generate schemas
    const classSchemas = generateClassSchemas(analysis, ctx.checker);
    const instanceMethodSchemas = analysis.instanceMethods.map((m) =>
      generateMethodSchemas(m, ctx.checker, loadedSchemas)
    );
    const staticMethodSchemas = analysis.staticMethods.map((m) =>
      generateMethodSchemas(m, ctx.checker, loadedSchemas)
    );

    // Write output
    const result = writeClassSchemas(
      analysis.name,
      classSchemas,
      instanceMethodSchemas,
      staticMethodSchemas,
      { outDir: testOutputDir }
    );

    // Verify directory structure
    expect(fs.existsSync(result.dir)).toBe(true);
    expect(fs.existsSync(path.join(result.dir, "schema.json"))).toBe(true);
    expect(fs.existsSync(path.join(result.dir, "ui_schema.json"))).toBe(true);
    expect(
      fs.existsSync(path.join(result.dir, "instance_methods", "activate", "params.schema.json"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(result.dir, "instance_methods", "activate", "params.ui_schema.json"))
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(result.dir, "static_methods", "createStandard", "return_type.schema.json")
      )
    ).toBe(true);

    // Verify JSON content
    const schemaContent: unknown = JSON.parse(
      fs.readFileSync(path.join(result.dir, "schema.json"), "utf-8")
    );
    expect((schemaContent as { type: string }).type).toBe("object");
    expect((schemaContent as { properties: unknown }).properties).toBeDefined();
  });

  it("writes FormSpec schemas to output directory", async () => {
    const { formSpecs } = await loadFormSpecs(compiledPath);

    const result = writeFormSpecSchemas(formSpecs, { outDir: testOutputDir });

    expect(fs.existsSync(result.dir)).toBe(true);
    expect(fs.existsSync(path.join(result.dir, "UserRegistrationForm", "schema.json"))).toBe(true);
    expect(fs.existsSync(path.join(result.dir, "UserRegistrationForm", "ui_schema.json"))).toBe(true);
    expect(fs.existsSync(path.join(result.dir, "ProductConfigForm", "schema.json"))).toBe(true);
  });
});
