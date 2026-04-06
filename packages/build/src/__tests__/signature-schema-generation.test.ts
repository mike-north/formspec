import * as path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  createStaticBuildContext,
  generateSchemasFromParameter,
  generateSchemasFromReturnType,
  generateSchemasFromType,
  resolveModuleExportDeclaration,
} from "../index.js";

const fixturePath = path.join(__dirname, "fixtures", "method-signature-schemas.ts");

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

describe("method-signature schema generation", () => {
  it("generates schemas from named method parameter types", () => {
    const context = createStaticBuildContext(fixturePath);
    const declaration = resolveModuleExportDeclaration(context, "PaymentService");
    if (declaration === null || !ts.isClassDeclaration(declaration)) {
      throw new Error("PaymentService class not found");
    }

    const method = getMethod(declaration, "submit");
    const parameter = method.parameters[0];
    if (parameter === undefined) {
      throw new Error("submit parameter not found");
    }

    const schemas = generateSchemasFromParameter({
      context,
      parameter,
    });

    expect(schemas.jsonSchema.title).toBe("Submit Input");
    expect(schemas.jsonSchema.properties).toMatchObject({
      amount_cents: { type: "number" },
      currency: { type: "string", title: "Currency" },
    });
    expect(schemas.jsonSchema.required).toEqual(["amount_cents", "currency"]);
    expect(schemas.uiSchema).toMatchObject({
      type: "VerticalLayout",
      elements: [
        { type: "Control", scope: "#/properties/amount_cents" },
        { type: "Control", scope: "#/properties/currency", label: "Currency" },
      ],
    });
  });

  it("generates schemas from named method return types", () => {
    const context = createStaticBuildContext(fixturePath);
    const declaration = resolveModuleExportDeclaration(context, "PaymentService");
    if (declaration === null || !ts.isClassDeclaration(declaration)) {
      throw new Error("PaymentService class not found");
    }

    const method = getMethod(declaration, "submit");
    const schemas = generateSchemasFromReturnType({
      context,
      declaration: method,
    });

    expect(schemas.jsonSchema.title).toBe("Submit Result");
    expect(schemas.jsonSchema.properties).toMatchObject({
      approved_flag: { type: "boolean" },
    });
    expect(schemas.uiSchema).toMatchObject({
      type: "VerticalLayout",
      elements: [{ type: "Control", scope: "#/properties/approved_flag" }],
    });
  });

  it("generates schemas from inline method parameter types", () => {
    const context = createStaticBuildContext(fixturePath);
    const declaration = resolveModuleExportDeclaration(context, "PaymentService");
    if (declaration === null || !ts.isClassDeclaration(declaration)) {
      throw new Error("PaymentService class not found");
    }

    const method = getMethod(declaration, "inline");
    const parameter = method.parameters[0];
    if (parameter === undefined) {
      throw new Error("inline parameter not found");
    }

    const schemas = generateSchemasFromParameter({
      context,
      parameter,
    });

    expect(schemas.jsonSchema.properties).toMatchObject({
      inline_amount_cents: { type: "number" },
      currency: { type: "string", title: "Inline Currency" },
    });
    expect(schemas.jsonSchema.required).toEqual(["inline_amount_cents", "currency"]);
    expect(schemas.uiSchema).toMatchObject({
      type: "VerticalLayout",
      elements: [
        { type: "Control", scope: "#/properties/inline_amount_cents" },
        { type: "Control", scope: "#/properties/currency", label: "Inline Currency" },
      ],
    });
  });

  it("generates schemas from inline method return types", () => {
    const context = createStaticBuildContext(fixturePath);
    const declaration = resolveModuleExportDeclaration(context, "PaymentService");
    if (declaration === null || !ts.isClassDeclaration(declaration)) {
      throw new Error("PaymentService class not found");
    }

    const method = getMethod(declaration, "inline");
    const schemas = generateSchemasFromReturnType({
      context,
      declaration: method,
    });

    expect(schemas.jsonSchema.properties).toMatchObject({
      inline_ok: { type: "boolean" },
    });
    expect(schemas.jsonSchema.required).toEqual(["inline_ok"]);
    expect(schemas.uiSchema).toMatchObject({
      type: "VerticalLayout",
      elements: [{ type: "Control", scope: "#/properties/inline_ok" }],
    });
  });

  it("supports advanced generation from a resolved TypeScript type", () => {
    const context = createStaticBuildContext(fixturePath);
    const declaration = resolveModuleExportDeclaration(context, "PaymentService");
    if (declaration === null || !ts.isClassDeclaration(declaration)) {
      throw new Error("PaymentService class not found");
    }

    const method = getMethod(declaration, "submit");
    const parameter = method.parameters[0];
    if (parameter === undefined) {
      throw new Error("submit parameter not found");
    }

    const type = context.checker.getTypeAtLocation(parameter);
    const schemas = generateSchemasFromType({
      context,
      type,
      sourceNode: parameter,
      name: "SubmitInputFromType",
    });

    expect(schemas.jsonSchema.properties).toMatchObject({
      amount_cents: { type: "number" },
      currency: { type: "string", title: "Currency" },
    });
    expect(schemas.uiSchema).toMatchObject({
      type: "VerticalLayout",
      elements: [
        { type: "Control", scope: "#/properties/amount_cents" },
        { type: "Control", scope: "#/properties/currency", label: "Currency" },
      ],
    });
  });

  it("returns no UI schema for non-object signature types", () => {
    const context = createStaticBuildContext(fixturePath);
    const declaration = resolveModuleExportDeclaration(context, "PaymentService");
    if (declaration === null || !ts.isClassDeclaration(declaration)) {
      throw new Error("PaymentService class not found");
    }

    const method = getMethod(declaration, "status");
    const schemas = generateSchemasFromReturnType({
      context,
      declaration: method,
    });

    expect(schemas.jsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      enum: ["ok", "error"],
    });
    expect(schemas.uiSchema).toBeNull();
  });

  it("preserves concrete generic type arguments for discovered signature types", () => {
    const context = createStaticBuildContext(fixturePath);
    const declaration = resolveModuleExportDeclaration(context, "PaymentService");
    if (declaration === null || !ts.isClassDeclaration(declaration)) {
      throw new Error("PaymentService class not found");
    }

    const method = getMethod(declaration, "wrappedSubmit");
    const schemas = generateSchemasFromReturnType({
      context,
      declaration: method,
    });

    expect(schemas.jsonSchema.properties).toMatchObject({
      payload: {
        $ref: "#/$defs/SubmitInput",
      },
    });
    expect(schemas.jsonSchema.$defs).toMatchObject({
      SubmitInput: {
        type: "object",
        properties: {
          amount_cents: { type: "number" },
          currency: { type: "string" },
        },
      },
    });
  });
});
