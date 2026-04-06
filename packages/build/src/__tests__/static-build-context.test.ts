import * as path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  createStaticBuildContext,
  createStaticBuildContextFromProgram,
  generateSchemasFromDeclaration,
  resolveModuleExport,
  resolveModuleExportDeclaration,
} from "../index.js";

const fixturesDir = path.join(__dirname, "fixtures");
const entryFixturePath = path.join(fixturesDir, "method-signature-schemas-entry.ts");
const targetFixturePath = path.join(fixturesDir, "method-signature-schemas.ts");

function createProgram(): ts.Program {
  return ts.createProgram([entryFixturePath, targetFixturePath], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
  });
}

describe("static build context", () => {
  it("creates a reusable compiler context from a file path", () => {
    const context = createStaticBuildContext(entryFixturePath);

    expect(context.sourceFile.fileName).toBe(entryFixturePath);
    expect(context.program.getSourceFile(entryFixturePath)).toBe(context.sourceFile);
  });

  it("creates a reusable compiler context from an existing program", () => {
    const program = createProgram();

    const context = createStaticBuildContextFromProgram(program, entryFixturePath);

    expect(context.program).toBe(program);
    expect(context.sourceFile.fileName).toBe(entryFixturePath);
  });

  it("resolves named exports through re-exports", () => {
    const context = createStaticBuildContext(entryFixturePath);

    const symbol = resolveModuleExport(context, "PaymentService");
    const declaration = resolveModuleExportDeclaration(context, "PaymentService");

    expect(symbol?.getName()).toBe("PaymentService");
    expect(declaration && ts.isClassDeclaration(declaration)).toBe(true);
    expect(declaration?.getSourceFile().fileName).toBe(targetFixturePath);
  });

  it("resolves the default export through re-exports", () => {
    const context = createStaticBuildContext(entryFixturePath);

    const declaration = resolveModuleExportDeclaration(context);

    expect(declaration && ts.isClassDeclaration(declaration)).toBe(true);
    expect((declaration as ts.ClassDeclaration | null)?.name?.text).toBe("PaymentService");
    expect(declaration?.getSourceFile().fileName).toBe(targetFixturePath);
  });

  it("returns null from declaration resolution for non-schema export kinds", () => {
    const context = createStaticBuildContext(entryFixturePath);

    expect(resolveModuleExport(context, "submitPayment")?.getName()).toBe("submitPayment");
    expect(resolveModuleExportDeclaration(context, "submitPayment")).toBeNull();
  });

  it("reuses one context for multiple declaration-driven generation operations", () => {
    const context = createStaticBuildContext(entryFixturePath);
    const inputDeclaration = resolveModuleExportDeclaration(context, "PaymentSubmitInput");
    const resultDeclaration = resolveModuleExportDeclaration(context, "PaymentSubmitResult");

    if (inputDeclaration === null || resultDeclaration === null) {
      throw new Error("Expected test exports to resolve");
    }

    const inputSchemas = generateSchemasFromDeclaration({
      context,
      declaration: inputDeclaration,
    });
    const resultSchemas = generateSchemasFromDeclaration({
      context,
      declaration: resultDeclaration,
    });

    expect(inputSchemas.jsonSchema.title).toBe("Submit Input");
    expect(inputSchemas.jsonSchema.properties).toMatchObject({
      amount_cents: { type: "number" },
      currency: { type: "string", title: "Currency" },
    });
    expect(inputSchemas.uiSchema).toMatchObject({
      type: "VerticalLayout",
      elements: [
        { type: "Control", scope: "#/properties/amount_cents" },
        { type: "Control", scope: "#/properties/currency", label: "Currency" },
      ],
    });

    expect(resultSchemas.jsonSchema.title).toBe("Submit Result");
    expect(resultSchemas.jsonSchema.properties).toMatchObject({
      approved_flag: { type: "boolean" },
    });
  });

  it("preserves alias-local metadata for declaration-driven alias generation", () => {
    const context = createStaticBuildContext(targetFixturePath);
    const declaration = resolveModuleExportDeclaration(context, "AliasedSubmitInput");
    if (declaration === null) {
      throw new Error("AliasedSubmitInput export not found");
    }

    const schemas = generateSchemasFromDeclaration({
      context,
      declaration,
    });

    expect(schemas.jsonSchema.title).toBe("Aliased Submit Input");
  });
});
