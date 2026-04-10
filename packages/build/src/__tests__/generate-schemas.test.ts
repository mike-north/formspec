import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { generateSchemas, type GenerateSchemasOptions } from "../generators/class-schema.js";

const namedPrimitiveAliasesFixture = path.join(__dirname, "fixtures", "named-primitive-aliases.ts");
const nestedArrayPathConstraintsFixture = path.join(
  __dirname,
  "fixtures",
  "nested-array-path-constraints.ts"
);
const serializedNameRegressionFixture = path.join(
  __dirname,
  "fixtures",
  "serialized-name-regression.ts"
);
const metadataDescriptionRegressionFixture = path.join(
  __dirname,
  "fixtures",
  "issue-220-metadata-description.ts"
);
const methodSignatureSchemasFixture = path.join(
  __dirname,
  "fixtures",
  "method-signature-schemas.ts"
);

function generateSchemasOrThrow(options: Omit<GenerateSchemasOptions, "errorReporting">) {
  return generateSchemas({
    ...options,
    errorReporting: "throw",
  });
}

function findControlByScope(
  elements: readonly Record<string, unknown>[],
  scope: string
): Record<string, unknown> | undefined {
  return elements.find(
    (element) => element["type"] === "Control" && element["scope"] === scope
  );
}

describe("generateSchemas", () => {
  it("emits named primitive aliases into $defs for reused constrained aliases", () => {
    const result = generateSchemasOrThrow({
      filePath: namedPrimitiveAliasesFixture,
      typeName: "ServerConfig",
    });

    expect(result.jsonSchema.properties).toEqual({
      httpPort: { $ref: "#/$defs/PortNumber" },
      httpsPort: { $ref: "#/$defs/PortNumber" },
      cpuThreshold: { $ref: "#/$defs/Percentage" },
      requestCount: { $ref: "#/$defs/BigCounter" },
    });

    expect(result.jsonSchema.$defs).toMatchObject({
      PortNumber: {
        type: "integer",
        minimum: 0,
        maximum: 65535,
      },
      Percentage: {
        type: "number",
        minimum: 0,
        maximum: 100,
      },
      BigCounter: {
        type: "integer",
        minimum: 0,
        maximum: 9007199254740991,
      },
    });
  });

  it("preserves path-targeted uniqueItems on nested array fields", () => {
    const result = generateSchemasOrThrow({
      filePath: nestedArrayPathConstraintsFixture,
      typeName: "BlogConfig",
    });

    expect(result.jsonSchema.properties).toMatchObject({
      articles: {
        type: "array",
        minItems: 1,
        maxItems: 50,
        items: {
          allOf: [
            { $ref: "#/$defs/Article" },
            {
              properties: {
                tags: {
                  minItems: 1,
                  maxItems: 20,
                  uniqueItems: true,
                },
              },
            },
          ],
        },
      },
    });
  }, 15_000);

  it("uses resolved apiNames consistently in generated JSON Schema output", () => {
    const result = generateSchemasOrThrow({
      filePath: serializedNameRegressionFixture,
      typeName: "SerializedNameForm",
    });

    expect(result.jsonSchema.properties).toMatchObject({
      first_name: { type: "string" },
      total: {
        allOf: [
          { $ref: "#/$defs/RenamedAmount" },
          { properties: { amount_value: { minimum: 0 } } },
        ],
      },
      address: { $ref: "#/$defs/PostalAddress" },
    });
    expect(Object.keys(result.jsonSchema.properties ?? {})).toEqual(["first_name", "total", "address"]);
    expect(result.jsonSchema.required).toEqual(["first_name", "total", "address"]);
    expect(result.jsonSchema.$defs).toMatchObject({
      PostalAddress: {
        type: "object",
        properties: {
          postal_code: { type: "string" },
        },
        required: ["postal_code"],
      },
      RenamedAmount: {
        type: "object",
        properties: {
          amount_value: { type: "number" },
        },
        required: ["amount_value"],
      },
    });
  });

  it("omits consumed metadata tags from descriptions for inline and nested properties", () => {
    const result = generateSchemasOrThrow({
      filePath: metadataDescriptionRegressionFixture,
      typeName: "MetadataDescriptionRegression",
      metadata: {
        field: {
          apiName: { mode: "prefer-explicit" },
          displayName: { mode: "prefer-explicit" },
        },
      },
    });

    expect(result.jsonSchema.properties).toMatchObject({
      workflow_status: {
        type: "string",
        description: "Inline status shown in the dashboard",
      },
      workflowState: {
        type: "string",
        title: "Workflow Status",
        description: "Inline summary for a labeled field",
      },
      nested: { $ref: "#/$defs/NestedApiMetadataDetails" },
    });

    expect(result.jsonSchema.$defs).toMatchObject({
      NestedApiMetadataDetails: {
        type: "object",
        properties: {
          nested_workflow_status: {
            type: "string",
            description: "Nested status shown in the dashboard",
          },
        },
        required: ["nested_workflow_status"],
      },
    });
  });

  it("supports direct object aliases through the public generation entry point", () => {
    const result = generateSchemasOrThrow({
      filePath: methodSignatureSchemasFixture,
      typeName: "AliasedSubmitInput",
    });

    expect(result.jsonSchema.title).toBe("Aliased Submit Input");
    expect(result.jsonSchema.properties).toMatchObject({
      amount_cents: { type: "number" },
      currency: { type: "string", title: "Currency" },
    });
    expect(result.jsonSchema.required).toEqual(["amount_cents", "currency"]);
    expect(result.uiSchema.elements).toMatchObject([
      { type: "Control", scope: "#/properties/amount_cents" },
      { type: "Control", scope: "#/properties/currency", label: "Currency" },
    ]);
  });

  it("preserves field metadata and optionality for mapped utility aliases", () => {
    const result = generateSchemasOrThrow({
      filePath: methodSignatureSchemasFixture,
      typeName: "PartialSubmitInput",
    });

    expect(result.jsonSchema.title).toBe("Partial Submit Input");
    expect(result.jsonSchema.properties).toMatchObject({
      amount_cents: { type: "number" },
      currency: { type: "string", title: "Currency" },
    });
    expect(result.jsonSchema.required).toBeUndefined();

    const currencyControl = findControlByScope(result.uiSchema.elements, "#/properties/currency");
    expect(currencyControl).toMatchObject({
      type: "Control",
      scope: "#/properties/currency",
      label: "Currency",
    });
  });

  it("supports Pick aliases without leaking omitted properties", () => {
    const result = generateSchemasOrThrow({
      filePath: methodSignatureSchemasFixture,
      typeName: "AmountOnlySubmitInput",
    });

    expect(result.jsonSchema.title).toBe("Amount Only Submit Input");
    expect(result.jsonSchema.properties).toEqual({
      amount_cents: { type: "number" },
    });
    expect(result.jsonSchema.required).toEqual(["amount_cents"]);
    expect(result.uiSchema.elements).toEqual([
      { type: "Control", scope: "#/properties/amount_cents" },
    ]);
  });

  it("supports utility/intersection aliases that add inline members", () => {
    const result = generateSchemasOrThrow({
      filePath: methodSignatureSchemasFixture,
      typeName: "AuditedSubmitInput",
    });

    expect(result.jsonSchema.title).toBe("Audited Submit Input");
    expect(result.jsonSchema.properties).toMatchObject({
      amount_cents: { type: "number" },
      currency: { type: "string", title: "Currency" },
      auditId: { type: "string", title: "Audit Id" },
    });
    expect(result.jsonSchema.required).toEqual(["auditId"]);

    const auditControl = findControlByScope(result.uiSchema.elements, "#/properties/auditId");
    expect(auditControl).toMatchObject({
      type: "Control",
      scope: "#/properties/auditId",
      label: "Audit Id",
    });
  });

  it("rejects mixed alias intersections that duplicate property names", () => {
    expect(() =>
      generateSchemasOrThrow({
        filePath: methodSignatureSchemasFixture,
        typeName: "ConflictingSubmitInput",
      })
    ).toThrow(/duplicate property names[\s\S]*currency/i);
  });

  it("rejects mixed alias intersections that duplicate quoted property names", () => {
    expect(() =>
      generateSchemasOrThrow({
        filePath: methodSignatureSchemasFixture,
        typeName: "QuotedConflictingSubmitInput",
      })
    ).toThrow(/duplicate property names[\s\S]*currency/i);
  });

  it("rejects callable intersections that only look object-like structurally", () => {
    expect(() =>
      generateSchemasOrThrow({
        filePath: methodSignatureSchemasFixture,
        typeName: "CallableSubmitInput",
      })
    ).toThrow(/not an object-like type alias/i);
  });
});
