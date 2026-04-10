import * as path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  createStaticBuildContext,
  createStaticBuildContextFromProgram,
  generateSchemasFromDeclaration,
  generateSchemasFromParameter,
  generateSchemasFromReturnType,
  generateSchemasFromType,
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

function getMethod(
  classDeclaration: ts.ClassDeclaration,
  methodName: string
): ts.MethodDeclaration {
  const method = classDeclaration.members.find(
    (member): member is ts.MethodDeclaration =>
      ts.isMethodDeclaration(member) &&
      ts.isIdentifier(member.name) &&
      member.name.text === methodName
  );

  if (method === undefined) {
    throw new Error(`Method "${methodName}" not found`);
  }

  return method;
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

  it("finds schema-source declarations on merged export symbols", () => {
    const context = createStaticBuildContext(targetFixturePath);

    const declaration = resolveModuleExportDeclaration(context, "MergedConfig");
    if (declaration === null) {
      throw new Error("MergedConfig export not found");
    }

    expect(ts.isInterfaceDeclaration(declaration)).toBe(true);
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

  it("supports host-owned program workflows through public schema-generation helpers", () => {
    const program = createProgram();
    const context = createStaticBuildContextFromProgram(program, entryFixturePath);
    const serviceDeclaration = resolveModuleExportDeclaration(context, "PaymentService");
    const inputDeclaration = resolveModuleExportDeclaration(context, "PaymentSubmitInput");
    const submitSymbol = resolveModuleExport(context, "submitPayment");
    const submitDeclaration = submitSymbol?.declarations?.find(ts.isFunctionDeclaration);
    const asyncSubmitSymbol = resolveModuleExport(context, "submitPaymentAsync");
    const asyncSubmitDeclaration = asyncSubmitSymbol?.declarations?.find(ts.isFunctionDeclaration);
    if (serviceDeclaration === null || !ts.isClassDeclaration(serviceDeclaration)) {
      throw new Error("PaymentService class not found");
    }
    if (inputDeclaration === null) {
      throw new Error("PaymentSubmitInput type not found");
    }
    if (submitDeclaration === undefined) {
      throw new Error("submitPayment function not found");
    }
    if (asyncSubmitDeclaration === undefined) {
      throw new Error("submitPaymentAsync function not found");
    }

    const declarationSchemas = generateSchemasFromDeclaration({
      context,
      declaration: inputDeclaration,
    });
    const submitMethod = getMethod(serviceDeclaration, "submit");
    const parameter = submitMethod.parameters[0];
    if (parameter === undefined) {
      throw new Error("submit parameter not found");
    }

    const parameterSchemas = generateSchemasFromParameter({
      context,
      parameter,
    });
    const returnSchemas = generateSchemasFromReturnType({
      context,
      declaration: submitMethod,
    });
    const functionReturnSchemas = generateSchemasFromReturnType({
      context,
      declaration: submitDeclaration,
    });
    const asyncFunctionReturnSchemas = generateSchemasFromReturnType({
      context,
      declaration: asyncSubmitDeclaration,
    });
    const typeSchemas = generateSchemasFromType({
      context,
      type: context.checker.getTypeAtLocation(parameter),
      sourceNode: parameter,
      name: "SubmitInputFromHostProgram",
    });

    expect(declarationSchemas.jsonSchema.title).toBe("Submit Input");
    expect(declarationSchemas.jsonSchema.properties).toMatchObject({
      amount_cents: { type: "number" },
      currency: { type: "string", title: "Currency" },
    });

    expect(parameterSchemas.jsonSchema.title).toBe("Submit Input");
    expect(parameterSchemas.jsonSchema.properties).toMatchObject({
      amount_cents: { type: "number" },
      currency: { type: "string", title: "Currency" },
    });

    expect(returnSchemas.jsonSchema.title).toBe("Submit Result");
    expect(returnSchemas.jsonSchema.properties).toMatchObject({
      approved_flag: { type: "boolean" },
    });
    expect(functionReturnSchemas.jsonSchema.title).toBe("Submit Result");
    expect(functionReturnSchemas.jsonSchema.properties).toMatchObject({
      approved_flag: { type: "boolean" },
    });
    expect(asyncFunctionReturnSchemas.jsonSchema.title).toBe("Submit Result");
    expect(asyncFunctionReturnSchemas.jsonSchema.properties).toMatchObject({
      approved_flag: { type: "boolean" },
    });

    expect(typeSchemas.jsonSchema.properties).toMatchObject({
      amount_cents: { type: "number" },
      currency: { type: "string", title: "Currency" },
    });
    expect(typeSchemas.uiSchema).toMatchObject({
      type: "VerticalLayout",
      elements: [
        { type: "Control", scope: "#/properties/amount_cents" },
        { type: "Control", scope: "#/properties/currency", label: "Currency" },
      ],
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

  it("returns resolved metadata for declaration-driven object roots", () => {
    const context = createStaticBuildContext(targetFixturePath);
    const declaration = resolveModuleExportDeclaration(context, "PaymentMethod");
    if (declaration === null) {
      throw new Error("PaymentMethod export not found");
    }

    const schemas = generateSchemasFromDeclaration({
      context,
      declaration,
    });

    expect(schemas.resolvedMetadata).toEqual({
      apiName: { value: "payment_method", source: "explicit" },
      apiNamePlural: { value: "payment_methods", source: "explicit" },
      displayName: { value: "Payment Method", source: "explicit" },
      displayNamePlural: { value: "Payment Methods", source: "explicit" },
    });
    expect(schemas.jsonSchema.title).toBe("Payment Method");
  });

  it("returns resolved metadata for declaration-driven standalone aliases and type generation", () => {
    const context = createStaticBuildContext(targetFixturePath);
    const declaration = resolveModuleExportDeclaration(context, "PaymentStatus");
    if (declaration === null) {
      throw new Error("PaymentStatus export not found");
    }

    const declarationSchemas = generateSchemasFromDeclaration({
      context,
      declaration,
    });
    const typeSchemas = generateSchemasFromType({
      context,
      type: context.checker.getTypeAtLocation(declaration),
      sourceNode: declaration,
      name: "PaymentStatus",
    });

    expect(declarationSchemas.resolvedMetadata).toEqual({
      apiName: { value: "payment_status", source: "explicit" },
      apiNamePlural: { value: "payment_statuses", source: "explicit" },
      displayName: { value: "Payment Status", source: "explicit" },
      displayNamePlural: { value: "Payment Statuses", source: "explicit" },
    });
    expect(declarationSchemas.uiSchema).toBeNull();
    expect(declarationSchemas.jsonSchema.title).toBe("Payment Status");

    expect(typeSchemas.resolvedMetadata).toEqual({
      apiName: { value: "payment_status", source: "explicit" },
      apiNamePlural: { value: "payment_statuses", source: "explicit" },
      displayName: { value: "Payment Status", source: "explicit" },
      displayNamePlural: { value: "Payment Statuses", source: "explicit" },
    });
  });

  it("surfaces declaration diagnostics for fallback alias generation", () => {
    const context = createStaticBuildContext(targetFixturePath);
    const declaration = resolveModuleExportDeclaration(context, "InvalidTaggedStatus");
    if (declaration === null) {
      throw new Error("InvalidTaggedStatus export not found");
    }

    expect(() =>
      generateSchemasFromDeclaration({
        context,
        declaration,
      })
    ).toThrow(/INVALID_TAG_PLACEMENT/);
  });
});
