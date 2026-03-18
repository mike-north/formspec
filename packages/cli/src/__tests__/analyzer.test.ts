/**
 * Unit tests for the analyzer module (imported from @formspec/build).
 *
 * These tests verify that the CLI can use the analysis API from @formspec/build.
 * Comprehensive analyzer tests are in @formspec/build.
 */

import { describe, it, expect } from "vitest";
import * as path from "node:path";
import {
  createProgramContext,
  findClassByName,
  analyzeClass,
} from "@formspec/build/internals";

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
});

