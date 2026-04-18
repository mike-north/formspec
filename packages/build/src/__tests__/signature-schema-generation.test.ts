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

  it("unwraps Promise return types for async methods", () => {
    const context = createStaticBuildContext(fixturePath);
    const declaration = resolveModuleExportDeclaration(context, "PaymentService");
    if (declaration === null || !ts.isClassDeclaration(declaration)) {
      throw new Error("PaymentService class not found");
    }

    const method = getMethod(declaration, "submitAsync");
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

  it("preserves generic type arguments after unwrapping Promise return types", () => {
    const context = createStaticBuildContext(fixturePath);
    const declaration = resolveModuleExportDeclaration(context, "PaymentService");
    if (declaration === null || !ts.isClassDeclaration(declaration)) {
      throw new Error("PaymentService class not found");
    }

    const method = getMethod(declaration, "wrappedSubmitAsync");
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
    expect(schemas.jsonSchema.type).toBeUndefined();
    expect(schemas.uiSchema).toBeNull();
  });

  it("maps `void` return types to null schemas (regression: issue #257)", () => {
    const context = createStaticBuildContext(fixturePath);
    const declaration = resolveModuleExportDeclaration(context, "PaymentService");
    if (declaration === null || !ts.isClassDeclaration(declaration)) {
      throw new Error("PaymentService class not found");
    }

    const method = getMethod(declaration, "returnsVoid");
    const schemas = generateSchemasFromReturnType({
      context,
      declaration: method,
    });

    // Before the fix, `void` silently fell through to `{ type: "string" }`,
    // making it indistinguishable from an actual string return type.
    expect(schemas.jsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "null",
    });
  });

  it("maps `Promise<void>` return types to null schemas (regression: issue #257)", () => {
    const context = createStaticBuildContext(fixturePath);
    const declaration = resolveModuleExportDeclaration(context, "PaymentService");
    if (declaration === null || !ts.isClassDeclaration(declaration)) {
      throw new Error("PaymentService class not found");
    }

    const method = getMethod(declaration, "returnsVoidAsync");
    const schemas = generateSchemasFromReturnType({
      context,
      declaration: method,
    });

    expect(schemas.jsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "null",
    });
  });

  it("still maps `any` return types to a permissive string schema", () => {
    const context = createStaticBuildContext(fixturePath);
    const declaration = resolveModuleExportDeclaration(context, "PaymentService");
    if (declaration === null || !ts.isClassDeclaration(declaration)) {
      throw new Error("PaymentService class not found");
    }

    const method = getMethod(declaration, "returnsAny");
    const schemas = generateSchemasFromReturnType({
      context,
      declaration: method,
    });

    expect(schemas.jsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "string",
    });
  });

  it("still maps `unknown` return types to a permissive string schema", () => {
    const context = createStaticBuildContext(fixturePath);
    const declaration = resolveModuleExportDeclaration(context, "PaymentService");
    if (declaration === null || !ts.isClassDeclaration(declaration)) {
      throw new Error("PaymentService class not found");
    }

    const method = getMethod(declaration, "returnsUnknown");
    const schemas = generateSchemasFromReturnType({
      context,
      declaration: method,
    });

    expect(schemas.jsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "string",
    });
  });

  it("throws when a Promise return type cannot be unwrapped (regression: issue #256)", () => {
    // Simulate the "missing lib files" scenario from issue #256: when the
    // TypeScript compiler host cannot locate `lib.es2015.promise.d.ts`,
    // `checker.getAwaitedType(Promise<T>)` returns the input type unchanged.
    // Previously the payload would silently degrade to `{ type: "string" }`;
    // now `unwrapPromiseType` throws with a descriptive error.
    const context = createStaticBuildContext(fixturePath);
    const declaration = resolveModuleExportDeclaration(context, "PaymentService");
    if (declaration === null || !ts.isClassDeclaration(declaration)) {
      throw new Error("PaymentService class not found");
    }

    const method = getMethod(declaration, "submitAsync");
    const brokenChecker: ts.TypeChecker = new Proxy(context.checker, {
      get(target, prop, receiver): unknown {
        if (prop === "getAwaitedType") {
          // Simulate a broken host by returning the Promise type as-is.
          return (type: ts.Type): ts.Type => type;
        }
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });

    const brokenContext = { ...context, checker: brokenChecker };

    expect(() =>
      generateSchemasFromReturnType({
        context: brokenContext,
        declaration: method,
      })
    ).toThrow(/could not unwrap the awaited type from "Promise<.*>"/);
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

describe("metadata policy that would rename the synthetic __result wrapper (regression for PR #285)", () => {
  // Policy that strips leading underscores from field apiNames — the same
  // behavior (in miniature) as Stripe's toStripeApiCase. Before the fix,
  // this transformed the internal synthetic "__result" field to "result",
  // and toStandaloneJsonSchema's schema.properties["__result"] lookup
  // threw "FormSpec failed to extract the standalone schema root from
  // the synthetic IR."
  const renamingFieldApiNamePolicy = {
    field: {
      apiName: {
        mode: "infer-if-missing" as const,
        infer: ({ logicalName }: { logicalName: string }): string =>
          logicalName.replace(/^_+/u, ""),
      },
    },
  };

  function getPaymentService(context: ReturnType<typeof createStaticBuildContext>): ts.ClassDeclaration {
    const declaration = resolveModuleExportDeclaration(context, "PaymentService");
    if (declaration === null || !ts.isClassDeclaration(declaration)) {
      throw new Error("PaymentService class not found");
    }
    return declaration;
  }

  it("handles a union-alias return type via generateSchemasFromReturnType", () => {
    const context = createStaticBuildContext(fixturePath);
    const method = getMethod(getPaymentService(context), "status");

    const schemas = generateSchemasFromReturnType({
      context,
      declaration: method,
      metadata: renamingFieldApiNamePolicy,
    });

    // The synthetic wrapper must be unwrapped — the root schema is the
    // union itself, not an object carrying a "__result" or "result" key.
    expect(schemas.jsonSchema).toMatchObject({ enum: ["ok", "error"] });
    const properties = (schemas.jsonSchema as { properties?: Record<string, unknown> }).properties;
    expect(properties?.["__result"]).toBeUndefined();
    expect(properties?.["result"]).toBeUndefined();
  });

  it("handles an `any` return type via generateSchemasFromReturnType", () => {
    const context = createStaticBuildContext(fixturePath);
    const method = getMethod(getPaymentService(context), "returnsAny");

    // Pre-fix this threw; post-fix it must produce a schema without the
    // wrapper leaking into properties.
    expect(() =>
      generateSchemasFromReturnType({
        context,
        declaration: method,
        metadata: renamingFieldApiNamePolicy,
      })
    ).not.toThrow();
  });

  it("handles a type-alias root via generateSchemasFromType", () => {
    const context = createStaticBuildContext(fixturePath);
    const aliasDeclaration = resolveModuleExportDeclaration(context, "PaymentStatus");
    if (aliasDeclaration === null || !ts.isTypeAliasDeclaration(aliasDeclaration)) {
      throw new Error("PaymentStatus type alias not found");
    }

    const type = context.checker.getTypeAtLocation(aliasDeclaration);

    const schemas = generateSchemasFromType({
      context,
      type,
      sourceNode: aliasDeclaration,
      metadata: renamingFieldApiNamePolicy,
    });

    expect(schemas.jsonSchema).toMatchObject({ enum: ["ok", "error"] });
    const properties = (schemas.jsonSchema as { properties?: Record<string, unknown> }).properties;
    expect(properties?.["__result"]).toBeUndefined();
    expect(properties?.["result"]).toBeUndefined();
  });
});
