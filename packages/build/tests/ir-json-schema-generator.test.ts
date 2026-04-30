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
  ResolvedMetadata,
} from "@formspec/core/internals";
import { IR_VERSION } from "@formspec/core/internals";
import { generateJsonSchemaFromIR } from "../src/json-schema/ir-generator.js";

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
  annotations: readonly AnnotationNode[] = [],
  metadata?: ResolvedMetadata
): FieldNode {
  return {
    kind: "field",
    name,
    ...(metadata !== undefined && { metadata }),
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

    it("uses resolved metadata for property names and titles", () => {
      const ir = makeIR([
        makeField("fullName", { kind: "primitive", primitiveKind: "string" }, true, [], [], {
          apiName: { value: "full_name", source: "explicit" },
          displayName: { value: "Full Name", source: "explicit" },
        }),
      ]);

      const schema = generateJsonSchemaFromIR(ir);

      expect(schema.properties).toEqual({
        full_name: { type: "string", title: "Full Name" },
      });
      expect(schema.required).toEqual(["full_name"]);
    });

    it("keeps resolved metadata titles ahead of displayName annotations on fields", () => {
      const ir = makeIR([
        makeField(
          "fullName",
          { kind: "primitive", primitiveKind: "string" },
          true,
          [],
          [
            {
              kind: "annotation",
              annotationKind: "displayName",
              value: "Annotation Title",
              provenance: PROVENANCE,
            },
          ],
          {
            displayName: { value: "Metadata Title", source: "explicit" },
          }
        ),
      ]);

      const schema = generateJsonSchemaFromIR(ir);

      expect(schema.properties).toEqual({
        fullName: { type: "string", title: "Metadata Title" },
      });
    });

    it("uses resolved apiName for $defs keys and $ref targets", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField("customer", {
            kind: "reference",
            name: "CustomerProfile",
            typeArguments: [],
          }),
        ],
        typeRegistry: {
          CustomerProfile: {
            name: "CustomerProfile",
            metadata: {
              apiName: { value: "customer_profile", source: "explicit" },
              displayName: { value: "Customer Profile", source: "explicit" },
            },
            type: {
              kind: "object",
              properties: [
                {
                  name: "givenName",
                  metadata: {
                    apiName: { value: "given_name", source: "explicit" },
                    displayName: { value: "Given Name", source: "explicit" },
                  },
                  type: { kind: "primitive", primitiveKind: "string" },
                  optional: false,
                  constraints: [],
                  annotations: [],
                  provenance: PROVENANCE,
                } satisfies ObjectProperty,
              ],
            },
            provenance: PROVENANCE,
          },
        },
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir);

      expect(schema.properties?.["customer"]).toEqual({
        $ref: "#/$defs/customer_profile",
      });
      expect(schema.$defs?.["customer_profile"]).toEqual({
        type: "object",
        title: "Customer Profile",
        properties: {
          given_name: { type: "string", title: "Given Name" },
        },
        required: ["given_name"],
      });
    });

    it("keeps resolved metadata titles ahead of displayName annotations on object properties", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField("customer", {
            kind: "reference",
            name: "CustomerProfile",
            typeArguments: [],
          }),
        ],
        typeRegistry: {
          CustomerProfile: {
            name: "CustomerProfile",
            type: {
              kind: "object",
              properties: [
                {
                  name: "givenName",
                  metadata: {
                    displayName: { value: "Metadata Title", source: "explicit" },
                  },
                  type: { kind: "primitive", primitiveKind: "string" },
                  optional: false,
                  constraints: [],
                  annotations: [
                    {
                      kind: "annotation",
                      annotationKind: "displayName",
                      value: "Annotation Title",
                      provenance: PROVENANCE,
                    },
                  ],
                  provenance: PROVENANCE,
                } satisfies ObjectProperty,
              ],
            },
            provenance: PROVENANCE,
          },
        },
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir);

      expect(schema.$defs?.["CustomerProfile"]).toEqual({
        type: "object",
        properties: {
          givenName: { type: "string", title: "Metadata Title" },
        },
        required: ["givenName"],
      });
    });

    it("throws when two named types resolve to the same $defs key", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [],
        typeRegistry: {
          FirstType: {
            name: "FirstType",
            metadata: {
              apiName: { value: "shared_type", source: "explicit" },
            },
            type: { kind: "primitive", primitiveKind: "string" },
            provenance: PROVENANCE,
          },
          SecondType: {
            name: "SecondType",
            metadata: {
              apiName: { value: "shared_type", source: "explicit" },
            },
            type: { kind: "primitive", primitiveKind: "number" },
            provenance: PROVENANCE,
          },
        },
        provenance: PROVENANCE,
      };

      expect(() => generateJsonSchemaFromIR(ir)).toThrow(/Serialized name collision in \$defs/);
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

    it("emits flat enum with a complete display-name extension by default", () => {
      const ir = makeIR([
        makeField("status", {
          kind: "enum",
          members: [
            { value: "draft", label: "Draft" },
            { value: "sent", label: "Sent to Customer" },
            { value: "paid", label: "Paid in Full" },
          ],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["status"];

      expect(prop).toEqual({
        enum: ["draft", "sent", "paid"],
        "x-formspec-display-names": {
          draft: "Draft",
          sent: "Sent to Customer",
          paid: "Paid in Full",
        },
      });
    });

    it("emits a complete display-name extension when only some members have displayNames", () => {
      const ir = makeIR([
        makeField("priority", {
          kind: "enum",
          members: [
            { value: "low", label: "Low" },
            { value: "high" }, // no label
          ],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["priority"];

      expect(prop).toEqual({
        enum: ["low", "high"],
        "x-formspec-display-names": {
          low: "Low",
          high: "high",
        },
      });
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

    it("supports oneOf serialization and omits title when it matches the value (issue #310)", () => {
      // Updated for #310: title is only emitted when label differs from the const value.
      // "sent" has no label, so its title is omitted (was redundant).
      // "draft" has label "Draft" (differs from value) → title emitted.
      // "paid" has label "Paid in Full" (differs from value) → title emitted.
      const ir = makeIR([
        makeField("status", {
          kind: "enum",
          members: [
            { value: "draft", label: "Draft" },
            { value: "sent" },
            { value: "paid", label: "Paid in Full" },
          ],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir, { enumSerialization: "oneOf" });
      const prop = (schema.properties as Record<string, unknown>)["status"];

      expect(prop).toEqual({
        oneOf: [
          { const: "draft", title: "Draft" },
          { const: "sent" },
          { const: "paid", title: "Paid in Full" },
        ],
      });
    });

    it("supports oneOf serialization when no member has a label", () => {
      // Updated for #310: when no member has a label, no titles are emitted.
      // Previously emitted title equal to const (e.g. { const: "draft", title: "draft" }),
      // which was redundant.
      const ir = makeIR([
        makeField("status", {
          kind: "enum",
          members: [{ value: "draft" }, { value: "sent" }],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir, { enumSerialization: "oneOf" });
      const prop = (schema.properties as Record<string, unknown>)["status"];

      expect(prop).toEqual({
        oneOf: [{ const: "draft" }, { const: "sent" }],
      });
    });

    it("emits title only for members whose label differs from the value (issue #310)", () => {
      // Mixed: some members have a meaningful label, others do not (or it matches).
      const ir = makeIR([
        makeField("currency", {
          kind: "enum",
          members: [
            { value: "USD" },
            { value: "EUR", label: "Euro" },
            { value: "GBP", label: "GBP" }, // label === value → omit title
          ],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir, { enumSerialization: "oneOf" });
      const prop = (schema.properties as Record<string, unknown>)["currency"];

      expect(prop).toEqual({
        oneOf: [{ const: "USD" }, { const: "EUR", title: "Euro" }, { const: "GBP" }],
      });
    });

    // Parameterized edge cases for #310: label === String(m.value) comparison semantics.
    // EnumMember.value is `string | number` — boolean values are not part of the IR type,
    // so there is no boolean edge case to test.
    it.each([
      {
        label: "numeric const matching stringified value — omit title",
        value: 42 as string | number,
        memberLabel: "42",
        expectedTitle: false,
      },
      {
        label: "numeric const with different label — emit title",
        value: 1 as string | number,
        memberLabel: "One",
        expectedTitle: true,
      },
      {
        label: "empty-string label matching empty-string value — omit title",
        value: "" as string | number,
        memberLabel: "",
        expectedTitle: false,
      },
      {
        label: "case-differing label — emit title (strict !== semantics, issue #310)",
        value: "USD" as string | number,
        memberLabel: "usd",
        expectedTitle: true,
      },
    ])("oneOf title omission edge case: $label", ({ value, memberLabel, expectedTitle }) => {
      const ir = makeIR([
        makeField("f", {
          kind: "enum",
          members: [{ value, label: memberLabel }],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir, { enumSerialization: "oneOf" });
      const prop = (schema.properties as Record<string, unknown>)["f"];

      if (expectedTitle) {
        expect(prop).toEqual({ oneOf: [{ const: value, title: memberLabel }] });
      } else {
        expect(prop).toEqual({ oneOf: [{ const: value }] });
      }
    });

    it("uses compact enum serialization in smart-size mode when titles would be redundant", () => {
      const ir = makeIR([
        makeField("status", {
          kind: "enum",
          members: [{ value: "draft", label: "draft" }, { value: "sent" }],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir, { enumSerialization: "smart-size" });
      const prop = (schema.properties as Record<string, unknown>)["status"];

      expect(prop).toEqual({
        enum: ["draft", "sent"],
      });
    });

    it("uses oneOf serialization in smart-size mode when any title is distinct", () => {
      const ir = makeIR([
        makeField("status", {
          kind: "enum",
          members: [{ value: "draft", label: "Draft" }, { value: "sent" }],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir, { enumSerialization: "smart-size" });
      const prop = (schema.properties as Record<string, unknown>)["status"];

      expect(prop).toEqual({
        oneOf: [{ const: "draft", title: "Draft" }, { const: "sent" }],
      });
    });

    it("throws when enumSerialization is invalid at runtime", () => {
      const ir = makeIR([]);
      const invalidOptions = {
        enumSerialization: "invalid",
      } as unknown as Parameters<typeof generateJsonSchemaFromIR>[1];

      expect(() => generateJsonSchemaFromIR(ir, invalidOptions)).toThrow(
        'Invalid enumSerialization "invalid". Expected "enum", "oneOf", or "smart-size".'
      );
    });

    it("uses the configured vendorPrefix for the display-name extension", () => {
      const ir = makeIR([
        makeField("status", {
          kind: "enum",
          members: [
            { value: "draft", label: "Draft" },
            { value: "sent", label: "Sent" },
          ],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir, { vendorPrefix: "x-acme" });
      const prop = (schema.properties as Record<string, unknown>)["status"];

      expect(prop).toEqual({
        enum: ["draft", "sent"],
        "x-acme-display-names": {
          draft: "Draft",
          sent: "Sent",
        },
      });
    });

    it("throws when display-name extension keys would collide after stringification", () => {
      const ir = makeIR([
        makeField("status", {
          kind: "enum",
          members: [
            { value: 1, label: "Numeric One" },
            { value: "1", label: "String One" },
          ],
        }),
      ]);

      expect(() => generateJsonSchemaFromIR(ir)).toThrow(/display-name key "1"/i);
    });

    it("supports display-name extension keys that match Object prototype properties", () => {
      const ir = makeIR([
        makeField("status", {
          kind: "enum",
          members: [
            { value: "__proto__", label: "Prototype" },
            { value: "constructor", label: "Constructor" },
          ],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["status"];
      const expectedDisplayNames: Record<string, string> = Object.create(null) as Record<
        string,
        string
      >;
      expectedDisplayNames["__proto__"] = "Prototype";
      // eslint-disable-next-line @typescript-eslint/dot-notation -- bracket form preserves test intent (key equals Object.prototype.constructor's own name)
      expectedDisplayNames["constructor"] = "Constructor";

      expect(prop).toEqual({
        enum: ["__proto__", "constructor"],
        "x-formspec-display-names": expectedDisplayNames,
      });
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
      expect(prop["required"]).toEqual(["city", "street"]);
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

    it("omits additionalProperties when object openness is policy-defaulted", () => {
      const ir = makeIR([makeField("obj", { kind: "object", properties: [] })]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["obj"] as Record<string, unknown>;

      expect(prop).not.toHaveProperty("additionalProperties");
    });

    it("emits additionalProperties:true when IR explicitly opens the object", () => {
      const ir = makeIR([
        makeField("obj", { kind: "object", properties: [], additionalProperties: true }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["obj"] as Record<string, unknown>;

      expect(prop["additionalProperties"]).toBe(true);
    });

    it("emits additionalProperties as a subschema when IR constrains extra values", () => {
      const ir = makeIR([
        makeField("obj", {
          kind: "object",
          properties: [],
          additionalProperties: { kind: "primitive", primitiveKind: "string" },
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["obj"] as Record<string, unknown>;

      expect(prop["additionalProperties"]).toEqual({ type: "string" });
    });

    it("does not emit passthroughObject before issue #416 PR-2 wires the keyword", () => {
      const ir = makeIR([
        makeField("obj", {
          kind: "object",
          properties: [],
          additionalProperties: true,
          passthrough: true,
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir);
      const prop = (schema.properties as Record<string, unknown>)["obj"] as Record<string, unknown>;

      expect(prop["additionalProperties"]).toBe(true);
      expect(prop).not.toHaveProperty("passthroughObject");
      expect(prop).not.toHaveProperty("x-formspec-passthroughObject");
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
    it("emits x-formspec-option-source for dynamic enum", () => {
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

      expect(prop).toEqual({ type: "string", "x-formspec-option-source": "countries" });
    });

    it("emits x-formspec-option-source-params when parameterFields are present", () => {
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
        "x-formspec-option-source": "cities",
        "x-formspec-option-source-params": ["country"],
      });
    });

    it("omits x-formspec-option-source-params when parameterFields is empty", () => {
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

      expect(prop).not.toHaveProperty("x-formspec-option-source-params");
    });

    it("emits x-formspec-schema-source with additionalProperties:true for dynamic schema", () => {
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
        "x-formspec-schema-source": "payloadSchema",
      });
    });

    it("uses the configured vendorPrefix for dynamic source extensions", () => {
      const ir = makeIR([
        makeField("city", {
          kind: "dynamic",
          dynamicKind: "enum",
          sourceKey: "cities",
          parameterFields: ["country"],
        }),
        makeField("payload", {
          kind: "dynamic",
          dynamicKind: "schema",
          sourceKey: "payloadSchema",
          parameterFields: [],
        }),
      ]);
      const schema = generateJsonSchemaFromIR(ir, { vendorPrefix: "x-acme" });

      expect(schema.properties?.["city"]).toEqual({
        type: "string",
        "x-acme-option-source": "cities",
        "x-acme-option-source-params": ["country"],
      });
      expect(schema.properties?.["payload"]).toEqual({
        type: "object",
        additionalProperties: true,
        "x-acme-schema-source": "payloadSchema",
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

    it("maps remarks → x-formspec-remarks (spec 003 §3.2)", () => {
      const ir = makeIR([
        makeField(
          "notes",
          { kind: "primitive", primitiveKind: "string" },
          false,
          [],
          [
            {
              kind: "annotation",
              annotationKind: "remarks",
              value: "Accepts markdown-formatted text",
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

      expect(prop["x-formspec-remarks"]).toBe("Accepts markdown-formatted text");
      expect(prop["description"]).toBeUndefined();
    });

    it("maps description + remarks to separate JSON Schema fields (spec 002 §2.3)", () => {
      const ir = makeIR([
        makeField(
          "email",
          { kind: "primitive", primitiveKind: "string" },
          false,
          [],
          [
            {
              kind: "annotation",
              annotationKind: "description",
              value: "The customer's primary email address.",
              provenance: PROVENANCE,
            },
            {
              kind: "annotation",
              annotationKind: "remarks",
              value: "Must conform to RFC 5322.",
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

      expect(prop["description"]).toBe("The customer's primary email address.");
      expect(prop["x-formspec-remarks"]).toBe("Must conform to RFC 5322.");
    });

    it("uses configured vendor prefix for remarks (spec 003 §3.1)", () => {
      const ir = makeIR([
        makeField(
          "notes",
          { kind: "primitive", primitiveKind: "string" },
          false,
          [],
          [
            {
              kind: "annotation",
              annotationKind: "remarks",
              value: "SDK-facing documentation",
              provenance: PROVENANCE,
            },
          ]
        ),
      ]);
      const schema = generateJsonSchemaFromIR(ir, { vendorPrefix: "x-acme" });
      const prop = (schema.properties as Record<string, unknown>)["notes"] as Record<
        string,
        unknown
      >;

      expect(prop["x-acme-remarks"]).toBe("SDK-facing documentation");
      expect(prop["x-formspec-remarks"]).toBeUndefined();
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

    it("uses vendorPrefix for deprecated messages when configured", () => {
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
      const schema = generateJsonSchemaFromIR(ir, { vendorPrefix: "x-acme" });
      const prop = (schema.properties as Record<string, unknown>)["legacyField"] as Record<
        string,
        unknown
      >;

      expect(prop["deprecated"]).toBe(true);
      expect(prop["x-acme-deprecation-description"]).toBe("Use newField instead");
      expect(prop["x-formspec-deprecation-description"]).toBeUndefined();
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

    it("sorts root required field names alphabetically and excludes optional fields", () => {
      const ir = makeIR([
        makeField("type", { kind: "primitive", primitiveKind: "string" }, true),
        makeField("label", { kind: "primitive", primitiveKind: "string" }, false),
        makeField("id", { kind: "primitive", primitiveKind: "string" }, true),
      ]);
      const schema = generateJsonSchemaFromIR(ir);

      expect(schema.required).toEqual(["id", "type"]);
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
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
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
                { value: "draft", label: "Draft" },
                { value: "sent", label: "Sent to Customer" },
                { value: "paid", label: "Paid in Full" },
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
            type: { kind: "object", properties: addressProperties },
            provenance: PROVENANCE,
          },
        },
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir);

      // Root-level assertions
      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(schema.type).toBe("object");
      expect(schema.required).toEqual(["billingAddress", "customerName", "status"]);

      const props = schema.properties as Record<string, Record<string, unknown>>;

      // customerName
      expect(props["customerName"]).toEqual({
        type: "string",
        title: "Customer Name",
        minLength: 1,
        maxLength: 100,
      });

      // status with displayNames → enum plus a complete display-name extension
      expect(props["status"]).toEqual({
        enum: ["draft", "sent", "paid"],
        "x-formspec-display-names": {
          draft: "Draft",
          sent: "Sent to Customer",
          paid: "Paid in Full",
        },
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
        required: ["city", "country", "street"],
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
        } satisfies TypeNode,
        provenance: PROVENANCE,
      },
    };

    it("emits $ref + sibling properties keyword for path-targeted constraints on reference types (issue #364)", () => {
      // JSON Schema 2020-12 §10.2.1 allows sibling keywords next to $ref.
      // The output must use sibling keywords, NOT allOf composition.
      // See: https://github.com/mike-north/formspec/issues/364
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
        $ref: "#/$defs/MonetaryAmount",
        properties: { value: { minimum: 0 } },
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
      // JSON Schema 2020-12 §10.2.1: sibling keywords next to $ref are valid.
      // The items schema must use sibling keywords, not allOf. (#364)
      expect(lineItems["items"]).toEqual({
        $ref: "#/$defs/MonetaryAmount",
        properties: { value: { minimum: 0 } },
      });
    });

    it("remaps nested path-targeted constraints through resolved property apiNames", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField(
            "lineItems",
            {
              kind: "array",
              items: { kind: "reference", name: "RenamedAmount", typeArguments: [] },
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
            ]
          ),
        ],
        typeRegistry: {
          RenamedAmount: {
            name: "RenamedAmount",
            type: {
              kind: "object",
              properties: [
                {
                  name: "value",
                  metadata: {
                    apiName: { value: "amount_value", source: "explicit" },
                  },
                  type: { kind: "primitive", primitiveKind: "number" },
                  optional: false,
                  constraints: [],
                  annotations: [],
                  provenance: PROVENANCE,
                },
              ],
            },
            provenance: PROVENANCE,
          },
        },
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir);
      const lineItems = (schema.properties as Record<string, unknown>)["lineItems"] as Record<
        string,
        unknown
      >;

      // JSON Schema 2020-12 §10.2.1: sibling keywords next to $ref are valid.
      // The remapped property name must appear in sibling properties, not allOf. (#364)
      expect(lineItems["items"]).toEqual({
        $ref: "#/$defs/RenamedAmount",
        properties: { amount_value: { minimum: 0 } },
      });
    });

    it("remaps multi-segment path-targeted constraints through resolved property apiNames", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField(
            "customer",
            {
              kind: "object",
              properties: [
                {
                  name: "billingAddress",
                  metadata: {
                    apiName: { value: "billing_address", source: "explicit" },
                  },
                  type: {
                    kind: "object",
                    properties: [
                      {
                        name: "postalCode",
                        metadata: {
                          apiName: { value: "postal_code", source: "explicit" },
                        },
                        type: { kind: "primitive", primitiveKind: "string" },
                        optional: false,
                        constraints: [],
                        annotations: [],
                        provenance: PROVENANCE,
                      },
                    ],
                  },
                  optional: false,
                  constraints: [],
                  annotations: [],
                  provenance: PROVENANCE,
                },
              ],
            },
            true,
            [
              {
                kind: "constraint",
                constraintKind: "pattern",
                pattern: "^\\d{5}$",
                path: { segments: ["billingAddress", "postalCode"] },
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

      expect((schema.properties as Record<string, unknown>)["customer"]).toMatchObject({
        type: "object",
        properties: {
          billing_address: {
            type: "object",
            properties: {
              postal_code: { type: "string", pattern: "^\\d{5}$" },
            },
            required: ["postal_code"],
          },
        },
        required: ["billing_address"],
      });
    });

    it("remaps nested path-targeted constraints through apiNames on nullable object properties", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField(
            "customer",
            {
              kind: "object",
              properties: [
                {
                  name: "billingAddress",
                  metadata: {
                    apiName: { value: "billing_address", source: "explicit" },
                  },
                  type: {
                    kind: "union",
                    members: [
                      {
                        kind: "object",
                        properties: [
                          {
                            name: "postalCode",
                            metadata: {
                              apiName: { value: "postal_code", source: "explicit" },
                            },
                            type: { kind: "primitive", primitiveKind: "string" },
                            optional: false,
                            constraints: [],
                            annotations: [],
                            provenance: PROVENANCE,
                          },
                        ],
                      },
                      { kind: "primitive", primitiveKind: "null" },
                    ],
                  },
                  optional: false,
                  constraints: [],
                  annotations: [],
                  provenance: PROVENANCE,
                },
              ],
            },
            true,
            [
              {
                kind: "constraint",
                constraintKind: "pattern",
                pattern: "^\\d{5}$",
                path: { segments: ["billingAddress", "postalCode"] },
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

      expect((schema.properties as Record<string, unknown>)["customer"]).toMatchObject({
        type: "object",
        properties: {
          billing_address: {
            oneOf: [
              {
                type: "object",
                properties: {
                  postal_code: { type: "string", pattern: "^\\d{5}$" },
                },
                required: ["postal_code"],
              },
              { type: "null" },
            ],
          },
        },
        required: ["billing_address"],
      });
    });

    it("remaps nested path-targeted constraints through apiNames on nullable array properties", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField(
            "customer",
            {
              kind: "object",
              properties: [
                {
                  name: "billingAddresses",
                  metadata: {
                    apiName: { value: "billing_addresses", source: "explicit" },
                  },
                  type: {
                    kind: "union",
                    members: [
                      {
                        kind: "array",
                        items: {
                          kind: "object",
                          properties: [
                            {
                              name: "postalCode",
                              metadata: {
                                apiName: { value: "postal_code", source: "explicit" },
                              },
                              type: { kind: "primitive", primitiveKind: "string" },
                              optional: false,
                              constraints: [],
                              annotations: [],
                              provenance: PROVENANCE,
                            },
                          ],
                        },
                      },
                      { kind: "primitive", primitiveKind: "null" },
                    ],
                  },
                  optional: false,
                  constraints: [],
                  annotations: [],
                  provenance: PROVENANCE,
                },
              ],
            },
            true,
            [
              {
                kind: "constraint",
                constraintKind: "pattern",
                pattern: "^\\d{5}$",
                path: { segments: ["billingAddresses", "postalCode"] },
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

      expect((schema.properties as Record<string, unknown>)["customer"]).toMatchObject({
        type: "object",
        properties: {
          billing_addresses: {
            oneOf: [
              {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    postal_code: { type: "string", pattern: "^\\d{5}$" },
                  },
                  required: ["postal_code"],
                },
              },
              { type: "null" },
            ],
          },
        },
        required: ["billing_addresses"],
      });
    });

    it("preserves composed overrides for nullable reference properties", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          makeField(
            "customer",
            {
              kind: "object",
              properties: [
                {
                  name: "billingAddress",
                  metadata: {
                    apiName: { value: "billing_address", source: "explicit" },
                  },
                  type: {
                    kind: "union",
                    members: [
                      {
                        kind: "reference",
                        name: "PostalAddress",
                        typeArguments: [],
                      },
                      { kind: "primitive", primitiveKind: "null" },
                    ],
                  },
                  optional: false,
                  constraints: [],
                  annotations: [],
                  provenance: PROVENANCE,
                },
              ],
            },
            true,
            [
              {
                kind: "constraint",
                constraintKind: "pattern",
                pattern: "^\\d{5}$",
                path: { segments: ["billingAddress", "postalCode"] },
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
        typeRegistry: {
          PostalAddress: {
            name: "PostalAddress",
            type: {
              kind: "object",
              properties: [
                {
                  name: "postalCode",
                  metadata: {
                    apiName: { value: "postal_code", source: "explicit" },
                  },
                  type: { kind: "primitive", primitiveKind: "string" },
                  optional: false,
                  constraints: [],
                  annotations: [],
                  provenance: PROVENANCE,
                },
              ],
            },
            provenance: PROVENANCE,
          },
        },
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir);

      expect((schema.properties as Record<string, unknown>)["customer"]).toMatchObject({
        type: "object",
        properties: {
          billing_address: {
            oneOf: [
              {
                $ref: "#/$defs/PostalAddress",
                properties: { postal_code: { pattern: "^\\d{5}$" } },
              },
              { type: "null" },
            ],
          },
        },
        required: ["billing_address"],
      });
    });

    it("merges inline object path targets for missing properties as flat siblings (no allOf — #382)", () => {
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
      // Fixes #382 Site 1: the base object and the missing-property override
      // are merged into a single flat schema. `additionalProperties`/`type`
      // remain as siblings; declaring the property in `properties` legitimizes
      // it regardless of the `additionalProperties` value.
      expect(address["allOf"]).toBeUndefined();
      expect(address["type"]).toBe("object");
      // spec 003 §2.5: omitted additionalProperties lets policy decide.
      expect(address["additionalProperties"]).toBeUndefined();
      expect(address["properties"]).toEqual({
        city: { type: "string" },
        missing: { minLength: 1 },
      });
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
      // JSON Schema 2020-12 §10.2.1: sibling keywords next to $ref are valid.
      // All overrides (title, properties) must appear as siblings alongside $ref,
      // not wrapped in allOf. (Fixes #364.)
      const schema = generateJsonSchemaFromIR(ir);
      expect((schema.properties as Record<string, unknown>)["total"]).toEqual({
        $ref: "#/$defs/MonetaryAmount",
        title: "Total Amount",
        properties: { value: { minimum: 0, maximum: 999999 } },
      });
    });
  });
});
