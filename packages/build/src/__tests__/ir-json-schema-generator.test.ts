/**
 * Tests for `generateJsonSchemaFromIR`.
 *
 * All tests use hand-constructed FormIR objects and assert against expected
 * JSON Schema 2020-12 output per design doc 003. Tests do NOT compare against
 * the legacy `generateJsonSchema` function.
 *
 * @see scratch/design/003-json-schema-vocabulary.md
 */

import { describe, expect, it } from "vitest";
import type {
  FormIR,
  FieldNode,
  TypeNode,
  ConstraintNode,
  AnnotationNode,
  Provenance,
  ObjectProperty,
} from "@formspec/core";
import { IR_VERSION } from "@formspec/core";
import { generateJsonSchemaFromIR } from "../json-schema/ir-generator.js";

// =============================================================================
// TEST HELPERS
// =============================================================================

/** Minimal provenance for test nodes. */
const PROVENANCE: Provenance = {
  surface: "chain-dsl",
  file: "/test.ts",
  line: 1,
  column: 0,
};

/** Builds a minimal FormIR with the given fields at the top level. */
function makeIR(fields: FieldNode[]): FormIR {
  return {
    kind: "form-ir",
    irVersion: IR_VERSION,
    elements: fields,
    typeRegistry: {},
    provenance: PROVENANCE,
  };
}

/** Builds a FieldNode with no constraints or annotations. */
function makeField(
  name: string,
  type: TypeNode,
  required = false,
  constraints: readonly ConstraintNode[] = [],
  annotations: readonly AnnotationNode[] = []
): FieldNode {
  return {
    kind: "field",
    name,
    type,
    required,
    constraints,
    annotations,
    provenance: PROVENANCE,
  };
}

// =============================================================================
// TOP-LEVEL STRUCTURE
// =============================================================================

describe("generateJsonSchemaFromIR", () => {
  describe("top-level schema structure", () => {
    it("emits $schema: 2020-12 URI", () => {
      const ir = makeIR([]);
      const schema = generateJsonSchemaFromIR(ir);

      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    });

    it("emits type: object at root", () => {
      const ir = makeIR([]);
      const schema = generateJsonSchemaFromIR(ir);

      expect(schema.type).toBe("object");
    });

    it("emits empty properties for form with no fields", () => {
      const ir = makeIR([]);
      const schema = generateJsonSchemaFromIR(ir);

      expect(schema.properties).toEqual({});
    });

    it("omits required when no fields are required", () => {
      const ir = makeIR([makeField("name", { kind: "primitive", primitiveKind: "string" }, false)]);
      const schema = generateJsonSchemaFromIR(ir);

      expect(schema).not.toHaveProperty("required");
    });

    it("omits $defs when typeRegistry is empty", () => {
      const ir = makeIR([makeField("x", { kind: "primitive", primitiveKind: "string" })]);
      const schema = generateJsonSchemaFromIR(ir);

      expect(schema).not.toHaveProperty("$defs");
    });
  });

  // =============================================================================
  // PRIMITIVE TYPES (§2.1)
  // =============================================================================

  describe("primitive types (§2.1)", () => {
    it.each([
      ["string", "string"],
      ["number", "number"],
      ["integer", "integer"],
      ["bigint", "integer"],
      ["boolean", "boolean"],
      ["null", "null"],
    ] as const)("maps primitive kind %s → type: %s", (primitiveKind, expected) => {
      const ir = makeIR([makeField("x", { kind: "primitive", primitiveKind })]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["x"];

      expect(prop).toEqual({ type: expected });
    });

    it("promotes number to integer when multipleOf:1 constraint is present", () => {
      const ir = makeIR([
        makeField("qty", { kind: "primitive", primitiveKind: "number" }, false, [
          {
            kind: "constraint",
            constraintKind: "multipleOf",
            value: 1,
            provenance: PROVENANCE,
          },
        ]),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["qty"];

      expect(prop).toEqual({ type: "integer" });
    });

    it("does not promote to integer when multipleOf is not 1", () => {
      const ir = makeIR([
        makeField("price", { kind: "primitive", primitiveKind: "number" }, false, [
          {
            kind: "constraint",
            constraintKind: "multipleOf",
            value: 0.01,
            provenance: PROVENANCE,
          },
        ]),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["price"];

      expect(prop).toEqual({ type: "number", multipleOf: 0.01 });
    });

    it("omits multipleOf keyword when promoting to integer", () => {
      const ir = makeIR([
        makeField("count", { kind: "primitive", primitiveKind: "number" }, false, [
          { kind: "constraint", constraintKind: "multipleOf", value: 1, provenance: PROVENANCE },
        ]),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["count"] as Record<
        string,
        unknown
      >;

      expect(prop).not.toHaveProperty("multipleOf");
    });
  });

  // =============================================================================
  // ENUM TYPES (§2.3)
  // =============================================================================

  describe("enum types (§2.3)", () => {
    it("emits flat enum for members without displayNames", () => {
      const ir = makeIR([
        makeField("status", {
          kind: "enum",
          members: [{ value: "draft" }, { value: "sent" }, { value: "paid" }],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["status"];

      expect(prop).toEqual({ enum: ["draft", "sent", "paid"] });
    });

    it("emits oneOf with title when any member has displayName", () => {
      const ir = makeIR([
        makeField("status", {
          kind: "enum",
          members: [
            { value: "draft", displayName: "Draft" },
            { value: "sent", displayName: "Sent to Customer" },
            { value: "paid", displayName: "Paid in Full" },
          ],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["status"];

      expect(prop).toEqual({
        oneOf: [
          { const: "draft", title: "Draft" },
          { const: "sent", title: "Sent to Customer" },
          { const: "paid", title: "Paid in Full" },
        ],
      });
    });

    it("emits oneOf when only some members have displayNames (partial)", () => {
      const ir = makeIR([
        makeField("priority", {
          kind: "enum",
          members: [
            { value: "low", displayName: "Low" },
            { value: "high" }, // no displayName
          ],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["priority"] as Record<
        string,
        unknown
      >;
      const oneOf = prop["oneOf"] as Record<string, unknown>[];

      expect(Array.isArray(oneOf)).toBe(true);
      expect(oneOf[0]).toEqual({ const: "low", title: "Low" });
      // Member without displayName should not have a title key
      expect(oneOf[1]).toEqual({ const: "high" });
      expect(oneOf[1]).not.toHaveProperty("title");
    });

    it("supports numeric enum values", () => {
      const ir = makeIR([
        makeField("level", {
          kind: "enum",
          members: [{ value: 1 }, { value: 2 }, { value: 3 }],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["level"];

      expect(prop).toEqual({ enum: [1, 2, 3] });
    });
  });

  // =============================================================================
  // ARRAY TYPES (§2.4)
  // =============================================================================

  describe("array types (§2.4)", () => {
    it("emits type:array with items sub-schema", () => {
      const ir = makeIR([
        makeField("tags", {
          kind: "array",
          items: { kind: "primitive", primitiveKind: "string" },
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["tags"];

      expect(prop).toEqual({ type: "array", items: { type: "string" } });
    });

    it("applies minItems constraint to array schema", () => {
      const ir = makeIR([
        makeField(
          "items",
          { kind: "array", items: { kind: "primitive", primitiveKind: "string" } },
          false,
          [{ kind: "constraint", constraintKind: "minItems", value: 1, provenance: PROVENANCE }]
        ),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["items"] as Record<
        string,
        unknown
      >;

      expect(prop["minItems"]).toBe(1);
    });

    it("applies maxItems constraint to array schema", () => {
      const ir = makeIR([
        makeField(
          "items",
          { kind: "array", items: { kind: "primitive", primitiveKind: "string" } },
          false,
          [{ kind: "constraint", constraintKind: "maxItems", value: 10, provenance: PROVENANCE }]
        ),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["items"] as Record<
        string,
        unknown
      >;

      expect(prop["maxItems"]).toBe(10);
    });

    it("applies uniqueItems constraint to array schema", () => {
      const ir = makeIR([
        makeField(
          "tags",
          { kind: "array", items: { kind: "primitive", primitiveKind: "string" } },
          false,
          [
            {
              kind: "constraint",
              constraintKind: "uniqueItems",
              value: true,
              provenance: PROVENANCE,
            },
          ]
        ),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["tags"] as Record<
        string,
        unknown
      >;

      expect(prop["uniqueItems"]).toBe(true);
    });
  });

  // =============================================================================
  // OBJECT TYPES (§2.5)
  // =============================================================================

  describe("object types (§2.5)", () => {
    it("emits type:object with properties and required", () => {
      const properties: ObjectProperty[] = [
        {
          name: "street",
          type: { kind: "primitive", primitiveKind: "string" },
          optional: false,
          constraints: [],
          annotations: [],
          provenance: PROVENANCE,
        },
        {
          name: "city",
          type: { kind: "primitive", primitiveKind: "string" },
          optional: false,
          constraints: [],
          annotations: [],
          provenance: PROVENANCE,
        },
        {
          name: "zip",
          type: { kind: "primitive", primitiveKind: "string" },
          optional: true,
          constraints: [],
          annotations: [],
          provenance: PROVENANCE,
        },
      ];

      const ir = makeIR([
        makeField("address", { kind: "object", properties, additionalProperties: false }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["address"] as Record<
        string,
        unknown
      >;

      expect(prop["type"]).toBe("object");
      expect((prop["properties"] as Record<string, unknown>)["street"]).toEqual({ type: "string" });
      expect((prop["properties"] as Record<string, unknown>)["city"]).toEqual({ type: "string" });
      expect((prop["properties"] as Record<string, unknown>)["zip"]).toEqual({ type: "string" });
      expect(prop["required"]).toEqual(["street", "city"]);
      expect(prop["required"]).not.toContain("zip");
    });

    it("emits additionalProperties:false when IR explicitly closes the object", () => {
      const ir = makeIR([
        makeField("obj", { kind: "object", properties: [], additionalProperties: false }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["obj"] as Record<string, unknown>;

      expect(prop["additionalProperties"]).toBe(false);
    });

    it("omits additionalProperties when IR allows it", () => {
      const ir = makeIR([
        makeField("obj", { kind: "object", properties: [], additionalProperties: true }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["obj"] as Record<string, unknown>;

      expect(prop).not.toHaveProperty("additionalProperties");
    });

    it("applies use-site constraints on object properties", () => {
      const properties: ObjectProperty[] = [
        {
          name: "value",
          type: { kind: "primitive", primitiveKind: "number" },
          optional: false,
          constraints: [
            { kind: "constraint", constraintKind: "minimum", value: 0, provenance: PROVENANCE },
          ],
          annotations: [],
          provenance: PROVENANCE,
        },
      ];

      const ir = makeIR([
        makeField("amount", { kind: "object", properties, additionalProperties: false }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const obj = (schema.properties as Record<string, unknown>)["amount"] as Record<
        string,
        unknown
      >;
      const valueProp = (obj["properties"] as Record<string, unknown>)["value"] as Record<
        string,
        unknown
      >;

      expect(valueProp["minimum"]).toBe(0);
    });
  });

  // =============================================================================
  // RECORD TYPES (§2.5) — BUG-3 regression
  // =============================================================================

  describe("record types (§2.5)", () => {
    it("emits type:object with additionalProperties schema for Record<string, string>", () => {
      // Regression: Record<string, string> was producing { $ref: '#/$defs/Record' }
      // where $defs/Record had additionalProperties: false.  Per spec 003 §2.5, it
      // must inline as { type: "object", additionalProperties: { type: "string" } }.
      const ir = makeIR([
        makeField("metadata", {
          kind: "record",
          valueType: { kind: "primitive", primitiveKind: "string" },
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["metadata"] as Record<
        string,
        unknown
      >;

      expect(prop["type"]).toBe("object");
      expect(prop["additionalProperties"]).toEqual({ type: "string" });
    });

    it("emits correct additionalProperties schema for Record<string, number>", () => {
      const ir = makeIR([
        makeField("counts", {
          kind: "record",
          valueType: { kind: "primitive", primitiveKind: "number" },
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["counts"] as Record<
        string,
        unknown
      >;

      expect(prop["type"]).toBe("object");
      expect(prop["additionalProperties"]).toEqual({ type: "number" });
    });

    it("keeps inline record fields out of $defs", () => {
      const ir = makeIR([
        makeField("labels", {
          kind: "record",
          valueType: { kind: "primitive", primitiveKind: "string" },
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["labels"] as Record<
        string,
        unknown
      >;

      expect(prop["type"]).toBe("object");
      expect(prop["additionalProperties"]).toEqual({ type: "string" });
      expect(schema).not.toHaveProperty("$defs");
    });

    it("does NOT emit a properties key on record types", () => {
      const ir = makeIR([
        makeField("tags", {
          kind: "record",
          valueType: { kind: "primitive", primitiveKind: "string" },
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["tags"] as Record<
        string,
        unknown
      >;

      expect(prop).not.toHaveProperty("properties");
    });

    it("does NOT lift record types to $defs", () => {
      // Regression: Record was being registered as a named type and lifted to $defs.
      const ir = makeIR([
        makeField("metadata", {
          kind: "record",
          valueType: { kind: "primitive", primitiveKind: "string" },
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);

      expect(schema).not.toHaveProperty("$defs");
    });
  });

  // =============================================================================
  // UNION TYPES (§2.3, §7.3, §7.4)
  // =============================================================================

  describe("union types (§7.4)", () => {
    it("emits anyOf for non-discriminated structural unions", () => {
      const ir = makeIR([
        makeField("value", {
          kind: "union",
          members: [
            { kind: "primitive", primitiveKind: "string" },
            { kind: "primitive", primitiveKind: "number" },
          ],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["value"];

      expect(prop).toEqual({
        anyOf: [{ type: "string" }, { type: "number" }],
      });
    });

    it("emits oneOf for nullable type (T | null) per spec 003 §2.3", () => {
      const ir = makeIR([
        makeField("optional", {
          kind: "union",
          members: [
            { kind: "primitive", primitiveKind: "string" },
            { kind: "primitive", primitiveKind: "null" },
          ],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["optional"];

      expect(prop).toEqual({
        oneOf: [{ type: "string" }, { type: "null" }],
      });
    });

    it("emits anyOf for unions with more than two members including null", () => {
      const ir = makeIR([
        makeField("value", {
          kind: "union",
          members: [
            { kind: "primitive", primitiveKind: "string" },
            { kind: "primitive", primitiveKind: "number" },
            { kind: "primitive", primitiveKind: "null" },
          ],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["value"];

      expect(prop).toEqual({
        anyOf: [{ type: "string" }, { type: "number" }, { type: "null" }],
      });
    });

    it("emits type:boolean for boolean union shorthand", () => {
      const ir = makeIR([
        makeField("flag", {
          kind: "union",
          members: [
            { kind: "primitive", primitiveKind: "boolean" },
            { kind: "primitive", primitiveKind: "boolean" },
          ],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["flag"];

      expect(prop).toEqual({ type: "boolean" });
    });
  });

  // =============================================================================
  // REFERENCE TYPES AND $DEFS (§5)
  // =============================================================================

  describe("reference types and $defs (§5)", () => {
    it("emits $ref for reference type", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [makeField("address", { kind: "reference", name: "Address", typeArguments: [] })],
        typeRegistry: {
          Address: {
            name: "Address",
            type: {
              kind: "object",
              properties: [
                {
                  name: "street",
                  type: { kind: "primitive", primitiveKind: "string" },
                  optional: false,
                  constraints: [],
                  annotations: [],
                  provenance: PROVENANCE,
                },
              ],
              additionalProperties: true,
            },
            provenance: PROVENANCE,
          },
        },
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["address"];

      expect(prop).toEqual({ $ref: "#/$defs/Address" });
    });

    it("emits recursive $defs entries for self-referential named types", () => {
      const circularNodeType = {
        kind: "object" as const,
        properties: [
          {
            name: "id",
            type: { kind: "primitive" as const, primitiveKind: "string" as const },
            optional: false,
            constraints: [],
            annotations: [],
            provenance: PROVENANCE,
          },
          {
            name: "next",
            type: { kind: "reference" as const, name: "CircularNode", typeArguments: [] as const },
            optional: true,
            constraints: [],
            annotations: [],
            provenance: PROVENANCE,
          },
        ],
        additionalProperties: true,
      };

      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField("node", { kind: "reference", name: "CircularNode", typeArguments: [] }),
        ],
        typeRegistry: {
          CircularNode: {
            name: "CircularNode",
            type: circularNodeType,
            provenance: PROVENANCE,
          },
        },
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir);
      const defs = schema.$defs as Record<string, unknown>;
      const circularDef = defs["CircularNode"] as Record<string, unknown>;
      const properties = circularDef["properties"] as Record<string, Record<string, unknown>>;

      expect(circularDef).toMatchObject({
        type: "object",
        required: ["id"],
      });
      expect(properties["next"]).toEqual({ $ref: "#/$defs/CircularNode" });
      expect((schema.properties as Record<string, unknown>)["node"]).toEqual({
        $ref: "#/$defs/CircularNode",
      });
    });

    it("emits $defs for named types in typeRegistry", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [makeField("address", { kind: "reference", name: "Address", typeArguments: [] })],
        typeRegistry: {
          Address: {
            name: "Address",
            type: {
              kind: "object",
              properties: [
                {
                  name: "street",
                  type: { kind: "primitive", primitiveKind: "string" },
                  optional: false,
                  constraints: [],
                  annotations: [],
                  provenance: PROVENANCE,
                },
              ],
              additionalProperties: true,
            },
            provenance: PROVENANCE,
          },
        },
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir);
      const defs = schema.$defs as Record<string, unknown>;

      expect(defs).toBeDefined();
      expect(defs["Address"]).toEqual({
        type: "object",
        properties: {
          street: { type: "string" },
        },
        required: ["street"],
      });
    });

    it("emits $defs for types in registry even if not referenced by any field", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [],
        typeRegistry: {
          Unused: {
            name: "Unused",
            type: { kind: "primitive", primitiveKind: "string" },
            provenance: PROVENANCE,
          },
        },
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir);
      const defs = schema.$defs as Record<string, unknown>;

      expect(defs).toBeDefined();
      expect(defs["Unused"]).toEqual({ type: "string" });
    });

    it("uses $defs (not definitions) per 2020-12", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [],
        typeRegistry: {
          Foo: {
            name: "Foo",
            type: { kind: "primitive", primitiveKind: "string" },
            provenance: PROVENANCE,
          },
        },
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir);

      expect(schema).not.toHaveProperty("definitions");
      expect(schema).toHaveProperty("$defs");
    });
  });

  // =============================================================================
  // DYNAMIC TYPES (§3.2)
  // =============================================================================

  describe("dynamic types (§3.2)", () => {
    it("emits x-formspec-source for dynamic enum", () => {
      const ir = makeIR([
        makeField("country", {
          kind: "dynamic",
          dynamicKind: "enum",
          sourceKey: "countries",
          parameterFields: [],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["country"];

      expect(prop).toEqual({ type: "string", "x-formspec-source": "countries" });
    });

    it("emits x-formspec-params when parameterFields are present", () => {
      const ir = makeIR([
        makeField("city", {
          kind: "dynamic",
          dynamicKind: "enum",
          sourceKey: "cities",
          parameterFields: ["country"],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["city"];

      expect(prop).toEqual({
        type: "string",
        "x-formspec-source": "cities",
        "x-formspec-params": ["country"],
      });
    });

    it("omits x-formspec-params when parameterFields is empty", () => {
      const ir = makeIR([
        makeField("country", {
          kind: "dynamic",
          dynamicKind: "enum",
          sourceKey: "countries",
          parameterFields: [],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["country"] as Record<
        string,
        unknown
      >;

      expect(prop).not.toHaveProperty("x-formspec-params");
    });

    it("emits x-formspec-schemaSource with additionalProperties:true for dynamic schema", () => {
      const ir = makeIR([
        makeField("payload", {
          kind: "dynamic",
          dynamicKind: "schema",
          sourceKey: "payloadSchema",
          parameterFields: [],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["payload"];

      expect(prop).toEqual({
        type: "object",
        additionalProperties: true,
        "x-formspec-schemaSource": "payloadSchema",
      });
    });
  });

  // =============================================================================
  // NUMERIC CONSTRAINTS (§2.6)
  // =============================================================================

  describe("numeric constraints (§2.6)", () => {
    it.each([
      ["minimum", "minimum", 0],
      ["maximum", "maximum", 100],
      ["exclusiveMinimum", "exclusiveMinimum", 0],
      ["exclusiveMaximum", "exclusiveMaximum", 100],
    ] as const)("applies %s constraint → %s keyword", (constraintKind, keyword, value) => {
      const ir = makeIR([
        makeField("num", { kind: "primitive", primitiveKind: "number" }, false, [
          { kind: "constraint", constraintKind, value, provenance: PROVENANCE },
        ]),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["num"] as Record<string, unknown>;

      expect(prop[keyword]).toBe(value);
    });
  });

  // =============================================================================
  // STRING CONSTRAINTS (§2.7)
  // =============================================================================

  describe("string constraints (§2.7)", () => {
    it("applies minLength constraint", () => {
      const ir = makeIR([
        makeField("name", { kind: "primitive", primitiveKind: "string" }, false, [
          { kind: "constraint", constraintKind: "minLength", value: 1, provenance: PROVENANCE },
        ]),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["name"] as Record<
        string,
        unknown
      >;

      expect(prop["minLength"]).toBe(1);
    });

    it("applies maxLength constraint", () => {
      const ir = makeIR([
        makeField("bio", { kind: "primitive", primitiveKind: "string" }, false, [
          { kind: "constraint", constraintKind: "maxLength", value: 500, provenance: PROVENANCE },
        ]),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["bio"] as Record<string, unknown>;

      expect(prop["maxLength"]).toBe(500);
    });

    it("applies pattern constraint", () => {
      const ir = makeIR([
        makeField("code", { kind: "primitive", primitiveKind: "string" }, false, [
          {
            kind: "constraint",
            constraintKind: "pattern",
            pattern: "^[A-Z]{2}$",
            provenance: PROVENANCE,
          },
        ]),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["code"] as Record<
        string,
        unknown
      >;

      expect(prop["pattern"]).toBe("^[A-Z]{2}$");
    });
  });

  // =============================================================================
  // ANNOTATIONS → METADATA KEYWORDS (§2.8)
  // =============================================================================

  describe("annotations → metadata keywords (§2.8)", () => {
    it("maps displayName → title", () => {
      const ir = makeIR([
        makeField(
          "name",
          { kind: "primitive", primitiveKind: "string" },
          false,
          [],
          [
            {
              kind: "annotation",
              annotationKind: "displayName",
              value: "Customer Name",
              provenance: PROVENANCE,
            },
          ]
        ),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["name"] as Record<
        string,
        unknown
      >;

      expect(prop["title"]).toBe("Customer Name");
    });

    it("maps description → description", () => {
      const ir = makeIR([
        makeField(
          "notes",
          { kind: "primitive", primitiveKind: "string" },
          false,
          [],
          [
            {
              kind: "annotation",
              annotationKind: "description",
              value: "Internal notes only",
              provenance: PROVENANCE,
            },
          ]
        ),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["notes"] as Record<
        string,
        unknown
      >;

      expect(prop["description"]).toBe("Internal notes only");
    });

    it("maps defaultValue → default", () => {
      const ir = makeIR([
        makeField(
          "status",
          { kind: "primitive", primitiveKind: "string" },
          false,
          [],
          [
            {
              kind: "annotation",
              annotationKind: "defaultValue",
              value: "draft",
              provenance: PROVENANCE,
            },
          ]
        ),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["status"] as Record<
        string,
        unknown
      >;

      expect(prop["default"]).toBe("draft");
    });

    it("maps deprecated → deprecated: true", () => {
      const ir = makeIR([
        makeField(
          "legacyField",
          { kind: "primitive", primitiveKind: "string" },
          false,
          [],
          [{ kind: "annotation", annotationKind: "deprecated", provenance: PROVENANCE }]
        ),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["legacyField"] as Record<
        string,
        unknown
      >;

      expect(prop["deprecated"]).toBe(true);
    });

    it("preserves deprecated messages in x-formspec-deprecation-description", () => {
      const ir = makeIR([
        makeField(
          "legacyField",
          { kind: "primitive", primitiveKind: "string" },
          false,
          [],
          [
            {
              kind: "annotation",
              annotationKind: "deprecated",
              message: "Use newField instead",
              provenance: PROVENANCE,
            },
          ]
        ),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["legacyField"] as Record<
        string,
        unknown
      >;

      expect(prop["deprecated"]).toBe(true);
      expect(prop["x-formspec-deprecation-description"]).toBe("Use newField instead");
    });

    it("does not emit placeholder annotation in JSON Schema", () => {
      const ir = makeIR([
        makeField(
          "email",
          { kind: "primitive", primitiveKind: "string" },
          false,
          [],
          [
            {
              kind: "annotation",
              annotationKind: "placeholder",
              value: "Enter your email",
              provenance: PROVENANCE,
            },
          ]
        ),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["email"] as Record<
        string,
        unknown
      >;

      expect(prop).not.toHaveProperty("placeholder");
    });

    it("does not emit formatHint annotation in JSON Schema", () => {
      const ir = makeIR([
        makeField(
          "date",
          { kind: "primitive", primitiveKind: "string" },
          false,
          [],
          [
            {
              kind: "annotation",
              annotationKind: "formatHint",
              format: "date",
              provenance: PROVENANCE,
            },
          ]
        ),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["date"] as Record<
        string,
        unknown
      >;

      expect(prop).not.toHaveProperty("format");
    });
  });

  // =============================================================================
  // REQUIRED FIELDS
  // =============================================================================

  describe("required fields", () => {
    it("includes required field names in root required array", () => {
      const ir = makeIR([
        makeField("name", { kind: "primitive", primitiveKind: "string" }, true),
        makeField("optional", { kind: "primitive", primitiveKind: "string" }, false),
      ]);
      const schema = generateJsonSchemaFromIR(ir);

      expect(schema.required).toEqual(["name"]);
    });

    it("deduplicates required entries (e.g., fields repeated across branches)", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField("x", { kind: "primitive", primitiveKind: "string" }, true),
          {
            kind: "conditional",
            fieldName: "toggle",
            value: "yes",
            elements: [makeField("x", { kind: "primitive", primitiveKind: "string" }, true)],
            provenance: PROVENANCE,
          },
        ],
        typeRegistry: {},
        provenance: PROVENANCE,
      };
      const schema = generateJsonSchemaFromIR(ir);

      expect(schema.required).toEqual(["x"]);
    });
  });

  // =============================================================================
  // LAYOUT NODES (groups and conditionals are transparent)
  // =============================================================================

  describe("layout nodes (groups and conditionals are transparent)", () => {
    it("flattens fields from groups into top-level properties", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          {
            kind: "group",
            label: "Contact",
            elements: [
              makeField("name", { kind: "primitive", primitiveKind: "string" }),
              makeField("email", { kind: "primitive", primitiveKind: "string" }),
            ],
            provenance: PROVENANCE,
          },
        ],
        typeRegistry: {},
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir);
      const props = schema.properties as Record<string, unknown>;

      expect(props).toHaveProperty("name");
      expect(props).toHaveProperty("email");
    });

    it("flattens fields from conditionals into top-level properties", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField("type", { kind: "primitive", primitiveKind: "string" }),
          {
            kind: "conditional",
            fieldName: "type",
            value: "business",
            elements: [makeField("companyName", { kind: "primitive", primitiveKind: "string" })],
            provenance: PROVENANCE,
          },
        ],
        typeRegistry: {},
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir);
      const props = schema.properties as Record<string, unknown>;

      expect(props).toHaveProperty("type");
      expect(props).toHaveProperty("companyName");
    });

    it("preserves field order across nested groups", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField("a", { kind: "primitive", primitiveKind: "string" }),
          {
            kind: "group",
            label: "Group",
            elements: [
              makeField("b", { kind: "primitive", primitiveKind: "string" }),
              makeField("c", { kind: "primitive", primitiveKind: "string" }),
            ],
            provenance: PROVENANCE,
          },
          makeField("d", { kind: "primitive", primitiveKind: "string" }),
        ],
        typeRegistry: {},
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir);
      const props = schema.properties as Record<string, unknown>;

      expect(Object.keys(props)).toEqual(["a", "b", "c", "d"]);
    });
  });

  // =============================================================================
  // DETERMINISM TEST
  // =============================================================================

  describe("determinism", () => {
    it("produces identical JSON.stringify output for the same IR", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField(
            "name",
            { kind: "primitive", primitiveKind: "string" },
            true,
            [
              {
                kind: "constraint",
                constraintKind: "maxLength",
                value: 100,
                provenance: PROVENANCE,
              },
            ],
            [
              {
                kind: "annotation",
                annotationKind: "displayName",
                value: "Customer Name",
                provenance: PROVENANCE,
              },
            ]
          ),
          makeField("age", { kind: "primitive", primitiveKind: "number" }, false, [
            { kind: "constraint", constraintKind: "minimum", value: 0, provenance: PROVENANCE },
          ]),
          makeField("status", {
            kind: "enum",
            members: [
              { value: "active", displayName: "Active" },
              { value: "inactive", displayName: "Inactive" },
            ],
          }),
        ],
        typeRegistry: {
          Address: {
            name: "Address",
            type: {
              kind: "object",
              properties: [
                {
                  name: "street",
                  type: { kind: "primitive", primitiveKind: "string" },
                  optional: false,
                  constraints: [],
                  annotations: [],
                  provenance: PROVENANCE,
                },
              ],
              additionalProperties: true,
            },
            provenance: PROVENANCE,
          },
        },
        provenance: PROVENANCE,
      };

      const result1 = JSON.stringify(generateJsonSchemaFromIR(ir));
      const result2 = JSON.stringify(generateJsonSchemaFromIR(ir));

      expect(result1).toBe(result2);
    });
  });

  // =============================================================================
  // FULL EXAMPLE (design doc 003 §9 excerpt)
  // =============================================================================

  describe("full example (design doc 003 §9 excerpt)", () => {
    it("generates correct schema for address-like object with constraints and annotations", () => {
      const addressProperties: ObjectProperty[] = [
        {
          name: "street",
          type: { kind: "primitive", primitiveKind: "string" },
          optional: false,
          constraints: [],
          annotations: [
            {
              kind: "annotation",
              annotationKind: "displayName",
              value: "Street",
              provenance: PROVENANCE,
            },
          ],
          provenance: PROVENANCE,
        },
        {
          name: "city",
          type: { kind: "primitive", primitiveKind: "string" },
          optional: false,
          constraints: [],
          annotations: [
            {
              kind: "annotation",
              annotationKind: "displayName",
              value: "City",
              provenance: PROVENANCE,
            },
          ],
          provenance: PROVENANCE,
        },
        {
          name: "country",
          type: { kind: "primitive", primitiveKind: "string" },
          optional: false,
          constraints: [
            { kind: "constraint", constraintKind: "minLength", value: 2, provenance: PROVENANCE },
            { kind: "constraint", constraintKind: "maxLength", value: 2, provenance: PROVENANCE },
            {
              kind: "constraint",
              constraintKind: "pattern",
              pattern: "^[A-Z]{2}$",
              provenance: PROVENANCE,
            },
          ],
          annotations: [
            {
              kind: "annotation",
              annotationKind: "displayName",
              value: "Country Code",
              provenance: PROVENANCE,
            },
          ],
          provenance: PROVENANCE,
        },
      ];

      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField(
            "customerName",
            { kind: "primitive", primitiveKind: "string" },
            true,
            [
              { kind: "constraint", constraintKind: "minLength", value: 1, provenance: PROVENANCE },
              {
                kind: "constraint",
                constraintKind: "maxLength",
                value: 100,
                provenance: PROVENANCE,
              },
            ],
            [
              {
                kind: "annotation",
                annotationKind: "displayName",
                value: "Customer Name",
                provenance: PROVENANCE,
              },
            ]
          ),
          makeField(
            "status",
            {
              kind: "enum",
              members: [
                { value: "draft", displayName: "Draft" },
                { value: "sent", displayName: "Sent to Customer" },
                { value: "paid", displayName: "Paid in Full" },
              ],
            },
            true,
            [],
            [
              {
                kind: "annotation",
                annotationKind: "defaultValue",
                value: "draft",
                provenance: PROVENANCE,
              },
            ]
          ),
          makeField(
            "billingAddress",
            { kind: "reference", name: "Address", typeArguments: [] },
            true,
            [],
            [
              {
                kind: "annotation",
                annotationKind: "displayName",
                value: "Billing Address",
                provenance: PROVENANCE,
              },
            ]
          ),
          makeField(
            "notes",
            { kind: "primitive", primitiveKind: "string" },
            false,
            [
              {
                kind: "constraint",
                constraintKind: "maxLength",
                value: 500,
                provenance: PROVENANCE,
              },
            ],
            [
              {
                kind: "annotation",
                annotationKind: "displayName",
                value: "Notes",
                provenance: PROVENANCE,
              },
            ]
          ),
        ],
        typeRegistry: {
          Address: {
            name: "Address",
            type: { kind: "object", properties: addressProperties, additionalProperties: true },
            provenance: PROVENANCE,
          },
        },
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir);

      // Root-level assertions
      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(schema.type).toBe("object");
      expect(schema.required).toEqual(["customerName", "status", "billingAddress"]);

      const props = schema.properties as Record<string, Record<string, unknown>>;

      // customerName
      expect(props["customerName"]).toEqual({
        type: "string",
        title: "Customer Name",
        minLength: 1,
        maxLength: 100,
      });

      // status with displayNames → oneOf
      expect(props["status"]).toEqual({
        oneOf: [
          { const: "draft", title: "Draft" },
          { const: "sent", title: "Sent to Customer" },
          { const: "paid", title: "Paid in Full" },
        ],
        default: "draft",
      });

      // billingAddress → $ref with sibling title
      expect(props["billingAddress"]).toEqual({
        $ref: "#/$defs/Address",
        title: "Billing Address",
      });

      // notes (optional)
      expect(props["notes"]).toEqual({ type: "string", title: "Notes", maxLength: 500 });

      // $defs — Address
      const defs = schema.$defs as Record<string, Record<string, unknown>>;
      expect(defs["Address"]).toEqual({
        type: "object",
        properties: {
          street: { type: "string", title: "Street" },
          city: { type: "string", title: "City" },
          country: {
            type: "string",
            title: "Country Code",
            minLength: 2,
            maxLength: 2,
            pattern: "^[A-Z]{2}$",
          },
        },
        required: ["street", "city", "country"],
      });
    });
  });

  // =============================================================================
  // PATH-TARGETED CONSTRAINTS
  // =============================================================================

  describe("path-targeted constraints", () => {
    const MONETARY_AMOUNT_REGISTRY = {
      MonetaryAmount: {
        name: "MonetaryAmount",
        type: {
          kind: "object" as const,
          properties: [
            {
              name: "value",
              type: { kind: "primitive" as const, primitiveKind: "number" as const },
              optional: false,
              constraints: [] as ConstraintNode[],
              annotations: [] as AnnotationNode[],
              provenance: PROVENANCE,
            },
            {
              name: "currency",
              type: { kind: "primitive" as const, primitiveKind: "string" as const },
              optional: false,
              constraints: [] as ConstraintNode[],
              annotations: [] as AnnotationNode[],
              provenance: PROVENANCE,
            },
          ],
          additionalProperties: true,
        } satisfies TypeNode,
        provenance: PROVENANCE,
      },
    };

    it("emits allOf with $ref and property overrides for path-targeted constraints on reference types", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField(
            "total",
            { kind: "reference", name: "MonetaryAmount", typeArguments: [] },
            true,
            [
              {
                kind: "constraint",
                constraintKind: "minimum",
                value: 0,
                path: { segments: ["value"] },
                provenance: {
                  surface: "tsdoc",
                  file: "/test.ts",
                  line: 1,
                  column: 0,
                  tagName: "@minimum",
                },
              },
            ]
          ),
        ],
        typeRegistry: MONETARY_AMOUNT_REGISTRY,
        provenance: PROVENANCE,
      };
      const schema = generateJsonSchemaFromIR(ir);
      expect((schema.properties as Record<string, unknown>)["total"]).toEqual({
        allOf: [{ $ref: "#/$defs/MonetaryAmount" }, { properties: { value: { minimum: 0 } } }],
      });
    });

    it("applies path-targeted constraints directly to inline object properties", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField(
            "address",
            {
              kind: "object",
              properties: [
                {
                  name: "zip",
                  type: { kind: "primitive", primitiveKind: "string" },
                  optional: false,
                  constraints: [],
                  annotations: [],
                  provenance: PROVENANCE,
                },
              ],
              additionalProperties: true,
            },
            true,
            [
              {
                kind: "constraint",
                constraintKind: "pattern",
                pattern: "^\\d{5}$",
                path: { segments: ["zip"] },
                provenance: {
                  surface: "tsdoc",
                  file: "/test.ts",
                  line: 1,
                  column: 0,
                  tagName: "@pattern",
                },
              },
            ]
          ),
        ],
        typeRegistry: {},
        provenance: PROVENANCE,
      };
      const schema = generateJsonSchemaFromIR(ir);
      expect((schema.properties as Record<string, unknown>)["address"]).toMatchObject({
        type: "object",
        properties: {
          zip: { type: "string", pattern: "^\\d{5}$" },
        },
      });
    });

    it("applies path-targeted constraints to items schema for array types", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField(
            "lineItems",
            {
              kind: "array",
              items: { kind: "reference", name: "MonetaryAmount", typeArguments: [] },
            },
            true,
            [
              {
                kind: "constraint",
                constraintKind: "minimum",
                value: 0,
                path: { segments: ["value"] },
                provenance: {
                  surface: "tsdoc",
                  file: "/test.ts",
                  line: 1,
                  column: 0,
                  tagName: "@minimum",
                },
              },
              {
                kind: "constraint",
                constraintKind: "minItems",
                value: 1,
                provenance: {
                  surface: "tsdoc",
                  file: "/test.ts",
                  line: 1,
                  column: 0,
                  tagName: "@minItems",
                },
              },
            ]
          ),
        ],
        typeRegistry: MONETARY_AMOUNT_REGISTRY,
        provenance: PROVENANCE,
      };
      const schema = generateJsonSchemaFromIR(ir);
      const lineItems = (schema.properties as Record<string, unknown>)["lineItems"] as Record<
        string,
        unknown
      >;
      expect(lineItems).toMatchObject({
        type: "array",
        minItems: 1,
      });
      expect(lineItems["items"]).toEqual({
        allOf: [{ $ref: "#/$defs/MonetaryAmount" }, { properties: { value: { minimum: 0 } } }],
      });
    });

    it("uses allOf for inline object path targets that don't exist in properties", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField(
            "address",
            {
              kind: "object",
              properties: [
                {
                  name: "city",
                  type: { kind: "primitive", primitiveKind: "string" },
                  optional: false,
                  constraints: [],
                  annotations: [],
                  provenance: PROVENANCE,
                },
              ],
              additionalProperties: true,
            },
            true,
            [
              {
                kind: "constraint",
                constraintKind: "minLength",
                value: 1,
                path: { segments: ["missing"] },
                provenance: {
                  surface: "tsdoc",
                  file: "/test.ts",
                  line: 1,
                  column: 0,
                  tagName: "@minLength",
                },
              },
            ]
          ),
        ],
        typeRegistry: {},
        provenance: PROVENANCE,
      };
      const schema = generateJsonSchemaFromIR(ir);
      const address = (schema.properties as Record<string, unknown>)["address"] as Record<
        string,
        unknown
      >;
      // Missing property should NOT be added directly — uses allOf to preserve
      // additionalProperties semantics on the base object.
      expect(address["allOf"]).toBeDefined();
      expect(address["type"]).toBeUndefined(); // base object is inside allOf[0]
    });

    it("returns schema unchanged for path-targeted constraints on non-traversable types", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField("count", { kind: "primitive", primitiveKind: "number" }, true, [
            {
              kind: "constraint",
              constraintKind: "minimum",
              value: 0,
              path: { segments: ["value"] },
              provenance: {
                surface: "tsdoc",
                file: "/test.ts",
                line: 1,
                column: 0,
                tagName: "@minimum",
              },
            },
          ]),
        ],
        typeRegistry: {},
        provenance: PROVENANCE,
      };
      const schema = generateJsonSchemaFromIR(ir);
      // Path-targeted constraint on a primitive should be a no-op —
      // the schema should just be the primitive type without allOf wrapping.
      expect((schema.properties as Record<string, unknown>)["count"]).toEqual({
        type: "number",
      });
    });

    it("handles mixed path-targeted and direct constraints on the same field", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField(
            "total",
            { kind: "reference", name: "MonetaryAmount", typeArguments: [] },
            true,
            [
              {
                kind: "constraint",
                constraintKind: "minimum",
                value: 0,
                path: { segments: ["value"] },
                provenance: {
                  surface: "tsdoc",
                  file: "/test.ts",
                  line: 1,
                  column: 0,
                  tagName: "@minimum",
                },
              },
              {
                kind: "constraint",
                constraintKind: "maximum",
                value: 999999,
                path: { segments: ["value"] },
                provenance: {
                  surface: "tsdoc",
                  file: "/test.ts",
                  line: 1,
                  column: 0,
                  tagName: "@maximum",
                },
              },
            ],
            [
              {
                kind: "annotation",
                annotationKind: "displayName",
                value: "Total Amount",
                provenance: {
                  surface: "tsdoc",
                  file: "/test.ts",
                  line: 1,
                  column: 0,
                  tagName: "@displayName",
                },
              },
            ]
          ),
        ],
        typeRegistry: MONETARY_AMOUNT_REGISTRY,
        provenance: PROVENANCE,
      };
      const schema = generateJsonSchemaFromIR(ir);
      expect((schema.properties as Record<string, unknown>)["total"]).toEqual({
        allOf: [
          { $ref: "#/$defs/MonetaryAmount" },
          {
            title: "Total Amount",
            properties: { value: { minimum: 0, maximum: 999999 } },
          },
        ],
      });
    });
  });
});
