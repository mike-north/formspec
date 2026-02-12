/**
 * Unit tests for the analyzer module.
 */

import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { createProgramContext, findClassByName } from "../analyzer/program.js";
import { analyzeClass } from "../analyzer/class-analyzer.js";
import { convertType } from "../analyzer/type-converter.js";

const fixturesDir = path.join(__dirname, "fixtures");
const sampleFormsPath = path.join(fixturesDir, "sample-forms.ts");

describe("program", () => {
  it("creates program context from TypeScript file", () => {
    const ctx = createProgramContext(sampleFormsPath);

    expect(ctx.program).toBeDefined();
    expect(ctx.checker).toBeDefined();
    expect(ctx.sourceFile).toBeDefined();
    expect(ctx.sourceFile.fileName).toContain("sample-forms.ts");
  });

  it("throws for non-existent file", () => {
    expect(() => createProgramContext("/non/existent/file.ts")).toThrow();
  });
});

describe("findClassByName", () => {
  it("finds InstallmentPlan class", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "InstallmentPlan");

    expect(classDecl).not.toBeNull();
    expect(classDecl?.name?.text).toBe("InstallmentPlan");
  });

  it("finds SimpleProduct class", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "SimpleProduct");

    expect(classDecl).not.toBeNull();
    expect(classDecl?.name?.text).toBe("SimpleProduct");
  });

  it("returns null for non-existent class", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "NonExistentClass");

    expect(classDecl).toBeNull();
  });
});

describe("analyzeClass", () => {
  it("analyzes InstallmentPlan fields", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "InstallmentPlan");
    if (!classDecl) throw new Error("InstallmentPlan class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    expect(analysis.name).toBe("InstallmentPlan");
    expect(analysis.fields).toHaveLength(4);

    const fieldNames = analysis.fields.map((f) => f.name);
    expect(fieldNames).toContain("status");
    expect(fieldNames).toContain("amount");
    expect(fieldNames).toContain("customerEmail");
    expect(fieldNames).toContain("installments");
  });

  it("detects optional fields", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "InstallmentPlan");
    if (!classDecl) throw new Error("InstallmentPlan class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const emailField = analysis.fields.find((f) => f.name === "customerEmail");
    const amountField = analysis.fields.find((f) => f.name === "amount");

    expect(emailField?.optional).toBe(true);
    expect(amountField?.optional).toBe(false);
  });

  it("analyzes instance methods", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "InstallmentPlan");
    if (!classDecl) throw new Error("InstallmentPlan class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    expect(analysis.instanceMethods).toHaveLength(2);

    const methodNames = analysis.instanceMethods.map((m) => m.name);
    expect(methodNames).toContain("activate");
    expect(methodNames).toContain("cancelPlan");
  });

  it("analyzes static methods", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "InstallmentPlan");
    if (!classDecl) throw new Error("InstallmentPlan class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    expect(analysis.staticMethods).toHaveLength(1);
    expect(analysis.staticMethods[0]?.name).toBe("createStandard");
  });

  it("detects InferSchema references in method parameters", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "InstallmentPlan");
    if (!classDecl) throw new Error("InstallmentPlan class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const activateMethod = analysis.instanceMethods.find(
      (m) => m.name === "activate"
    );
    expect(activateMethod?.parameters).toHaveLength(1);
    expect(activateMethod?.parameters[0]?.formSpecExportName).toBe(
      "ActivateParams"
    );

    const cancelMethod = analysis.instanceMethods.find(
      (m) => m.name === "cancelPlan"
    );
    expect(cancelMethod?.parameters[0]?.formSpecExportName).toBe("CancelParams");
  });

  it("analyzes SimpleProduct without FormSpec references", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "SimpleProduct");
    if (!classDecl) throw new Error("SimpleProduct class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    expect(analysis.name).toBe("SimpleProduct");
    expect(analysis.fields).toHaveLength(4);
    expect(analysis.instanceMethods).toHaveLength(1);
    expect(analysis.staticMethods).toHaveLength(0);

    // The update method shouldn't have a FormSpec reference
    const updateMethod = analysis.instanceMethods[0];
    expect(updateMethod?.parameters[0]?.formSpecExportName).toBeNull();
  });
});

describe("convertType", () => {
  it("converts string type", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "SimpleProduct");
    if (!classDecl) throw new Error("SimpleProduct class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const nameField = analysis.fields.find((f) => f.name === "name");
    if (!nameField) throw new Error("name field not found");
    const result = convertType(nameField.type, ctx.checker);

    expect(result.jsonSchema.type).toBe("string");
    expect(result.formSpecFieldType).toBe("text");
  });

  it("converts number type", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "SimpleProduct");
    if (!classDecl) throw new Error("SimpleProduct class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const priceField = analysis.fields.find((f) => f.name === "price");
    if (!priceField) throw new Error("price field not found");
    const result = convertType(priceField.type, ctx.checker);

    // price is optional so it's number | undefined
    expect(result.formSpecFieldType).toBe("number");
  });

  it("converts boolean type", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "SimpleProduct");
    if (!classDecl) throw new Error("SimpleProduct class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const activeField = analysis.fields.find((f) => f.name === "active");
    if (!activeField) throw new Error("active field not found");
    const result = convertType(activeField.type, ctx.checker);

    expect(result.jsonSchema.type).toBe("boolean");
    expect(result.formSpecFieldType).toBe("boolean");
  });

  it("converts string literal union to enum", () => {
    const ctx = createProgramContext(sampleFormsPath);
    const classDecl = findClassByName(ctx.sourceFile, "InstallmentPlan");
    if (!classDecl) throw new Error("InstallmentPlan class not found");
    const analysis = analyzeClass(classDecl, ctx.checker);

    const statusField = analysis.fields.find((f) => f.name === "status");
    if (!statusField) throw new Error("status field not found");
    const result = convertType(statusField.type, ctx.checker);

    expect(result.jsonSchema.enum).toEqual(["active", "paused", "canceled"]);
    expect(result.formSpecFieldType).toBe("enum");
  });
});
