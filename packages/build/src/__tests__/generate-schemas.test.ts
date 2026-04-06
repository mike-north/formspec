import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { generateSchemas } from "../generators/class-schema.js";

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

describe("generateSchemas", () => {
  it("emits named primitive aliases into $defs for reused constrained aliases", () => {
    const result = generateSchemas({
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
    const result = generateSchemas({
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
    const result = generateSchemas({
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
});
