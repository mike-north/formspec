/**
 * Regression tests for issue #364: `allOf` composition when field-level
 * constraints or annotations are applied to `$ref`-based types.
 *
 * Root cause: `applyPathTargetedConstraints` wrapped `{ $ref }` in an
 * `allOf` to add property overrides, even though JSON Schema 2020-12 allows
 * sibling keywords next to `$ref` (unlike draft-07). This produced:
 *
 *   { "allOf": [{ "$ref": "#/$defs/X" }, { "properties": {...}, "title": "..." }] }
 *
 * The fix uses sibling keywords instead:
 *
 *   { "$ref": "#/$defs/X", "properties": {...}, "title": "..." }
 *
 * This preserves `$defs` deduplication while emitting valid 2020-12 output
 * that downstream renderers can consume without needing to handle `allOf`
 * as a workaround for a spec-level limitation that no longer exists.
 *
 * @see https://github.com/mike-north/formspec/issues/364
 * @see https://json-schema.org/draft/2020-12/json-schema-core — §10.2.1 allows sibling keywords next to $ref
 */

import { describe, expect, it } from "vitest";
import type {
  FormIR,
  FieldNode,
  ConstraintNode,
  AnnotationNode,
  CustomTypeNode,
  Provenance,
} from "@formspec/core/internals";
import { defineCustomType, defineExtension, IR_VERSION } from "@formspec/core/internals";
import { generateJsonSchemaFromIR } from "../json-schema/ir-generator.js";
import { createExtensionRegistry } from "../extensions/index.js";

// =============================================================================
// TEST HELPERS
// =============================================================================

const PROVENANCE: Provenance = {
  surface: "chain-dsl",
  file: "/test.ts",
  line: 1,
  column: 0,
};

const TSDOC_PROVENANCE: Provenance = {
  surface: "tsdoc",
  file: "/test.ts",
  line: 1,
  column: 0,
  tagName: "@exclusiveMinimum",
};

function makeIR(fields: FieldNode[], typeRegistry: FormIR["typeRegistry"] = {}): FormIR {
  return {
    kind: "form-ir",
    irVersion: IR_VERSION,
    elements: fields,
    typeRegistry,
    provenance: PROVENANCE,
  };
}

/**
 * Registry with a `MonetaryAmount` type that has `value: number` and
 * `currency: string` — matches the scenario described in issue #364.
 */
const MONETARY_AMOUNT_REGISTRY: FormIR["typeRegistry"] = {
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
    },
    provenance: PROVENANCE,
  },
};

// =============================================================================
// REGRESSION TESTS — issue #364
// =============================================================================

describe("$ref with sibling keywords — issue #364", () => {
  // ---------------------------------------------------------------------------
  // Primary regression: path-targeted constraints on a $ref-based field
  // ---------------------------------------------------------------------------
  describe("path-targeted constraints on a $ref-based field", () => {
    it("emits $ref + sibling properties keyword instead of allOf", () => {
      // Scenario: interface with a field typed as a $defs-worthy type AND
      // a path-targeted constraint like `@exclusiveMinimum :value 0`.
      //
      // Before fix: { "allOf": [{ "$ref": "#/$defs/MonetaryAmount" }, { "properties": { "value": { "exclusiveMinimum": 0 } } }] }
      // After fix:  { "$ref": "#/$defs/MonetaryAmount", "properties": { "value": { "exclusiveMinimum": 0 } } }
      const ir = makeIR(
        [
          {
            kind: "field",
            name: "total",
            type: { kind: "reference", name: "MonetaryAmount", typeArguments: [] },
            required: true,
            constraints: [
              {
                kind: "constraint",
                constraintKind: "exclusiveMinimum",
                value: 0,
                path: { segments: ["value"] },
                provenance: TSDOC_PROVENANCE,
              },
            ],
            annotations: [],
            provenance: PROVENANCE,
          },
        ],
        MONETARY_AMOUNT_REGISTRY
      );

      const schema = generateJsonSchemaFromIR(ir);
      const totalProp = schema.properties?.["total"];

      // The $ref must appear as a sibling keyword, not inside allOf.
      expect(totalProp?.$ref).toBe("#/$defs/MonetaryAmount");

      // The property override must appear alongside $ref, not wrapped in allOf.
      expect(totalProp?.properties).toEqual({ value: { exclusiveMinimum: 0 } });

      // The allOf wrapper must NOT be present — this is the key regression guard.
      // spec: JSON Schema 2020-12 §10.2.1 allows sibling keywords next to $ref.
      expect(totalProp?.allOf).toBeUndefined();
    });

    it("emits $ref + sibling properties for @minimum constraint on nested field", () => {
      const ir = makeIR(
        [
          {
            kind: "field",
            name: "total",
            type: { kind: "reference", name: "MonetaryAmount", typeArguments: [] },
            required: true,
            constraints: [
              {
                kind: "constraint",
                constraintKind: "minimum",
                value: 0,
                path: { segments: ["value"] },
                provenance: TSDOC_PROVENANCE,
              },
            ],
            annotations: [],
            provenance: PROVENANCE,
          },
        ],
        MONETARY_AMOUNT_REGISTRY
      );

      const schema = generateJsonSchemaFromIR(ir);
      const totalProp = schema.properties?.["total"];

      expect(totalProp?.$ref).toBe("#/$defs/MonetaryAmount");
      expect(totalProp?.properties).toEqual({ value: { minimum: 0 } });
      expect(totalProp?.allOf).toBeUndefined();
    });

    it("emits $ref + sibling title keyword when metadata is also present", () => {
      // Scenario: field has both a path-targeted constraint AND a display name
      // (title), which ends up on the outer schema alongside $ref.
      const ir = makeIR(
        [
          {
            kind: "field",
            name: "total",
            type: { kind: "reference", name: "MonetaryAmount", typeArguments: [] },
            required: true,
            constraints: [
              {
                kind: "constraint",
                constraintKind: "exclusiveMinimum",
                value: 0,
                path: { segments: ["value"] },
                provenance: TSDOC_PROVENANCE,
              },
            ],
            annotations: [
              {
                kind: "annotation",
                annotationKind: "displayName",
                value: "Total Amount",
                provenance: PROVENANCE,
              },
            ],
            provenance: PROVENANCE,
          },
        ],
        MONETARY_AMOUNT_REGISTRY
      );

      const schema = generateJsonSchemaFromIR(ir);
      const totalProp = schema.properties?.["total"];

      // Both $ref and title must appear as siblings on the same object.
      expect(totalProp?.$ref).toBe("#/$defs/MonetaryAmount");
      expect(totalProp?.title).toBe("Total Amount");
      expect(totalProp?.properties).toEqual({ value: { exclusiveMinimum: 0 } });
      expect(totalProp?.allOf).toBeUndefined();
    });

    it("preserves $defs deduplication — MonetaryAmount still appears in $defs", () => {
      // Deduplication must not be lost when path-targeted constraints are applied.
      const ir = makeIR(
        [
          {
            kind: "field",
            name: "subtotal",
            type: { kind: "reference", name: "MonetaryAmount", typeArguments: [] },
            required: true,
            constraints: [
              {
                kind: "constraint",
                constraintKind: "minimum",
                value: 0,
                path: { segments: ["value"] },
                provenance: TSDOC_PROVENANCE,
              },
            ],
            annotations: [],
            provenance: PROVENANCE,
          },
          {
            kind: "field",
            name: "total",
            type: { kind: "reference", name: "MonetaryAmount", typeArguments: [] },
            required: true,
            constraints: [
              {
                kind: "constraint",
                constraintKind: "minimum",
                value: 0,
                path: { segments: ["value"] },
                provenance: TSDOC_PROVENANCE,
              },
            ],
            annotations: [],
            provenance: PROVENANCE,
          },
        ],
        MONETARY_AMOUNT_REGISTRY
      );

      const schema = generateJsonSchemaFromIR(ir);

      // $defs must still contain MonetaryAmount.
      expect(schema.$defs).toHaveProperty("MonetaryAmount");

      // Both fields reference it — deduplication preserved.
      expect(schema.properties?.["subtotal"]?.$ref).toBe("#/$defs/MonetaryAmount");
      expect(schema.properties?.["total"]?.$ref).toBe("#/$defs/MonetaryAmount");
    });
  });

  // ---------------------------------------------------------------------------
  // Array items: path-targeted constraints on a $ref-typed array element
  // ---------------------------------------------------------------------------
  describe("path-targeted constraints on array items that are $ref-based", () => {
    it("emits $ref + sibling properties on the items schema instead of allOf", () => {
      const ir = makeIR(
        [
          {
            kind: "field",
            name: "lineItems",
            type: {
              kind: "array",
              items: { kind: "reference", name: "MonetaryAmount", typeArguments: [] },
            },
            required: true,
            constraints: [
              {
                kind: "constraint",
                constraintKind: "minimum",
                value: 0,
                path: { segments: ["value"] },
                provenance: TSDOC_PROVENANCE,
              },
            ],
            annotations: [],
            provenance: PROVENANCE,
          },
        ],
        MONETARY_AMOUNT_REGISTRY
      );

      const schema = generateJsonSchemaFromIR(ir);
      const lineItemsItems = schema.properties?.["lineItems"]?.items;

      expect((lineItemsItems as Record<string, unknown>)["$ref"]).toBe("#/$defs/MonetaryAmount");
      expect((lineItemsItems as Record<string, unknown>)["properties"]).toEqual({
        value: { minimum: 0 },
      });
      // No allOf wrapping on the items schema either.
      expect((lineItemsItems as Record<string, unknown>)["allOf"]).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple path-targeted constraints on the same $ref field
  // ---------------------------------------------------------------------------
  describe("multiple path-targeted constraints on the same $ref field", () => {
    it("merges multiple property overrides into a single sibling properties map", () => {
      const ir = makeIR(
        [
          {
            kind: "field",
            name: "total",
            type: { kind: "reference", name: "MonetaryAmount", typeArguments: [] },
            required: true,
            constraints: [
              {
                kind: "constraint",
                constraintKind: "minimum",
                value: 0,
                path: { segments: ["value"] },
                provenance: TSDOC_PROVENANCE,
              },
              {
                kind: "constraint",
                constraintKind: "maxLength",
                value: 3,
                path: { segments: ["currency"] },
                provenance: TSDOC_PROVENANCE,
              },
            ],
            annotations: [],
            provenance: PROVENANCE,
          },
        ],
        MONETARY_AMOUNT_REGISTRY
      );

      const schema = generateJsonSchemaFromIR(ir);
      const totalProp = schema.properties?.["total"];

      expect(totalProp?.$ref).toBe("#/$defs/MonetaryAmount");
      expect(totalProp?.properties).toEqual({
        value: { minimum: 0 },
        currency: { maxLength: 3 },
      });
      expect(totalProp?.allOf).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Annotation-only: metadata on a $ref field with no path-targeted constraint
  // ---------------------------------------------------------------------------
  describe("annotations on a $ref-based field without path-targeted constraints", () => {
    it("emits $ref + sibling title without allOf", () => {
      // Ensures the no-constraint annotation path also avoids allOf. Path-target
      // constraints are what trigger `applyPathTargetedConstraints`, but
      // annotations flow through `applyAnnotations` on the same schema — the
      // resulting shape should still be flat siblings, never `allOf`.
      const ir = makeIR(
        [
          {
            kind: "field",
            name: "total",
            type: { kind: "reference", name: "MonetaryAmount", typeArguments: [] },
            required: true,
            constraints: [],
            annotations: [
              {
                kind: "annotation",
                annotationKind: "displayName",
                value: "Total Amount",
                provenance: PROVENANCE,
              },
            ],
            provenance: PROVENANCE,
          },
        ],
        MONETARY_AMOUNT_REGISTRY
      );

      const schema = generateJsonSchemaFromIR(ir);
      const totalProp = schema.properties?.["total"];

      expect(totalProp?.$ref).toBe("#/$defs/MonetaryAmount");
      expect(totalProp?.title).toBe("Total Amount");
      expect(totalProp?.allOf).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Deeply-nested path targets: constraint segments more than one level deep
  // ---------------------------------------------------------------------------
  describe("deeply-nested path-targeted constraints on a $ref field", () => {
    it("emits nested sibling properties for multi-segment path targets", () => {
      // Exercises the `buildPropertyOverrides` logic for path segments longer
      // than 1. Registers a type where `value` is itself an object with an
      // `amount` property, then applies a constraint at `value.amount`.
      const registry: FormIR["typeRegistry"] = {
        NestedMonetary: {
          name: "NestedMonetary",
          type: {
            kind: "object",
            properties: [
              {
                name: "value",
                type: {
                  kind: "object",
                  properties: [
                    {
                      name: "amount",
                      type: { kind: "primitive", primitiveKind: "number" },
                      optional: false,
                      constraints: [],
                      annotations: [],
                      provenance: PROVENANCE,
                    },
                  ],
                  additionalProperties: true,
                },
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
      };

      const ir = makeIR(
        [
          {
            kind: "field",
            name: "total",
            type: { kind: "reference", name: "NestedMonetary", typeArguments: [] },
            required: true,
            constraints: [
              {
                kind: "constraint",
                constraintKind: "minimum",
                value: 0,
                path: { segments: ["value", "amount"] },
                provenance: TSDOC_PROVENANCE,
              },
            ],
            annotations: [],
            provenance: PROVENANCE,
          },
        ],
        registry
      );

      const schema = generateJsonSchemaFromIR(ir);
      const totalProp = schema.properties?.["total"];

      expect(totalProp?.$ref).toBe("#/$defs/NestedMonetary");
      // The constraint lives two levels deep — once inside sibling
      // `properties.value`, and again inside that schema's `properties.amount`.
      expect(totalProp?.properties).toEqual({
        value: { properties: { amount: { minimum: 0 } } },
      });
      expect(totalProp?.allOf).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Top-level nullable $ref: `field: SomeRef | null` with a path-targeted
  // constraint. Exercises the `nullableValueBranch` recursion at
  // ir-generator.ts:467-480 where the $ref branch inside the nullable oneOf
  // must still emit as $ref + siblings (not allOf). Nested-nullable is
  // already covered in ir-json-schema-generator.test.ts; this fills the
  // top-level gap identified in the PR review.
  // ---------------------------------------------------------------------------
  describe("top-level nullable $ref with path-targeted constraint", () => {
    const NULLABLE_REGISTRY: FormIR["typeRegistry"] = {
      PostalAddress: {
        name: "PostalAddress",
        type: {
          kind: "object",
          properties: [
            {
              name: "postalCode",
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
    };

    it("emits $ref + sibling properties on the non-null oneOf branch", () => {
      // Scenario: a top-level field typed `PostalAddress | null` carries a
      // path-targeted constraint on a subfield of the non-null branch.
      // The schema must be a nullable oneOf where the $ref branch has the
      // override as a sibling keyword — not wrapped in allOf.
      const ir = makeIR(
        [
          {
            kind: "field",
            name: "billing",
            type: {
              kind: "union",
              members: [
                { kind: "reference", name: "PostalAddress", typeArguments: [] },
                { kind: "primitive", primitiveKind: "null" },
              ],
            },
            required: true,
            constraints: [
              {
                kind: "constraint",
                constraintKind: "pattern",
                pattern: "^\\d{5}$",
                path: { segments: ["postalCode"] },
                provenance: {
                  surface: "tsdoc",
                  file: "/test.ts",
                  line: 1,
                  column: 0,
                  tagName: "@pattern",
                },
              },
            ],
            annotations: [],
            provenance: PROVENANCE,
          },
        ],
        NULLABLE_REGISTRY
      );

      const schema = generateJsonSchemaFromIR(ir);
      const billingProp = schema.properties?.["billing"];

      // Nullable oneOf: the $ref branch carries sibling `properties`; the null
      // branch is `{ type: "null" }`. The $ref branch must NOT be wrapped in
      // allOf — that's the regression guard.
      expect(billingProp).toMatchObject({
        oneOf: [
          {
            $ref: "#/$defs/PostalAddress",
            properties: { postalCode: { pattern: "^\\d{5}$" } },
          },
          { type: "null" },
        ],
      });

      const refBranch = billingProp?.oneOf?.[0] as Record<string, unknown> | undefined;
      expect(refBranch?.["allOf"]).toBeUndefined();
    });

    it("preserves $defs deduplication for top-level nullable $ref overrides", () => {
      // Two independent top-level nullable $ref fields must still share the
      // same $defs entry — siblings attach to each $ref branch, not to the
      // deduplicated definition itself.
      const ir = makeIR(
        [
          {
            kind: "field",
            name: "billing",
            type: {
              kind: "union",
              members: [
                { kind: "reference", name: "PostalAddress", typeArguments: [] },
                { kind: "primitive", primitiveKind: "null" },
              ],
            },
            required: true,
            constraints: [
              {
                kind: "constraint",
                constraintKind: "pattern",
                pattern: "^\\d{5}$",
                path: { segments: ["postalCode"] },
                provenance: TSDOC_PROVENANCE,
              },
            ],
            annotations: [],
            provenance: PROVENANCE,
          },
          {
            kind: "field",
            name: "shipping",
            type: {
              kind: "union",
              members: [
                { kind: "reference", name: "PostalAddress", typeArguments: [] },
                { kind: "primitive", primitiveKind: "null" },
              ],
            },
            required: true,
            constraints: [
              {
                kind: "constraint",
                constraintKind: "minLength",
                value: 5,
                path: { segments: ["postalCode"] },
                provenance: TSDOC_PROVENANCE,
              },
            ],
            annotations: [],
            provenance: PROVENANCE,
          },
        ],
        NULLABLE_REGISTRY
      );

      const schema = generateJsonSchemaFromIR(ir);

      expect(schema.$defs).toHaveProperty("PostalAddress");
      const billingBranch = (schema.properties?.["billing"]?.oneOf?.[0] ?? {}) as Record<
        string,
        unknown
      >;
      const shippingBranch = (schema.properties?.["shipping"]?.oneOf?.[0] ?? {}) as Record<
        string,
        unknown
      >;
      expect(billingBranch["$ref"]).toBe("#/$defs/PostalAddress");
      expect(shippingBranch["$ref"]).toBe("#/$defs/PostalAddress");
      expect(billingBranch["allOf"]).toBeUndefined();
      expect(shippingBranch["allOf"]).toBeUndefined();
    });
  });
});

// =============================================================================
// REGRESSION TESTS — issue #382
// =============================================================================
//
// Follow-up to #365/#364: two `allOf` emission sites in
// `applyPathTargetedConstraints` remained after the primary fix. These tests
// guard against their regressions.
//
//   Site 1: inline-object missing-property fallback — must emit a single flat
//           object (base properties merged with missing overrides, sibling
//           `additionalProperties`/`type`), not an `allOf` wrapper.
//   Site 2: pre-composed `allOf` base — must flatten to siblings when the
//           composition is expressible as siblings under JSON Schema 2020-12
//           (§10.2.1). `allOf` is retained only for genuine non-sibling cases.
//
// @see https://github.com/mike-north/formspec/issues/382

describe("remaining allOf emission sites flattened to siblings — issue #382", () => {
  // ---------------------------------------------------------------------------
  // Site 1: inline-object missing-property fallback
  // ---------------------------------------------------------------------------
  describe("Site 1: inline-object with path target naming a property that does not exist (#382)", () => {
    it("emits a single flat object (no allOf wrapper) with sibling properties and preserved additionalProperties", () => {
      // Scenario: an inline object field has `additionalProperties: true` and
      // receives a path-targeted constraint pointing at a property that is not
      // declared on the base type. Historically this wrapped the base in
      // `allOf: [base, { properties: { missing: ... } }]`. The fix emits a
      // flat object: base props merged with the missing override, with
      // `additionalProperties` and `type` preserved as siblings.
      //
      // @see https://github.com/mike-north/formspec/issues/382 Site 1
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          {
            kind: "field",
            name: "address",
            type: {
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
            required: true,
            constraints: [
              {
                kind: "constraint",
                constraintKind: "minLength",
                value: 1,
                path: { segments: ["missing"] },
                provenance: TSDOC_PROVENANCE,
              },
            ],
            annotations: [],
            provenance: PROVENANCE,
          },
        ],
        typeRegistry: {},
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir);
      const address = schema.properties?.["address"] as Record<string, unknown> | undefined;

      // Regression guard: no allOf wrapping.
      expect(address?.["allOf"]).toBeUndefined();

      // Flat object: type is a sibling key, not buried inside allOf[0].
      expect(address?.["type"]).toBe("object");

      // `additionalProperties: true` is the default and is intentionally
      // omitted from output (spec 003 §2.5); the semantics are preserved by
      // absence of the keyword, not by its explicit presence.
      expect(address?.["additionalProperties"]).toBeUndefined();

      // Base property ("city") and the missing-override property ("missing")
      // both appear in a single sibling properties map.
      expect(address?.["properties"]).toEqual({
        city: { type: "string" },
        missing: { minLength: 1 },
      });
    });

    it("preserves additionalProperties: false from the base when merging missing overrides", () => {
      // Variant: base has `additionalProperties: false`. The fix must still
      // preserve this semantic, otherwise the new flat property would be
      // rejected against the base schema. Merging into the base properties
      // legitimizes the property so additionalProperties: false stays safe.
      //
      // @see https://github.com/mike-north/formspec/issues/382 Site 1
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          {
            kind: "field",
            name: "address",
            type: {
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
              additionalProperties: false,
            },
            required: true,
            constraints: [
              {
                kind: "constraint",
                constraintKind: "minLength",
                value: 1,
                path: { segments: ["missing"] },
                provenance: TSDOC_PROVENANCE,
              },
            ],
            annotations: [],
            provenance: PROVENANCE,
          },
        ],
        typeRegistry: {},
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir);
      const address = schema.properties?.["address"] as Record<string, unknown> | undefined;

      expect(address?.["allOf"]).toBeUndefined();
      expect(address?.["additionalProperties"]).toBe(false);
      expect(address?.["properties"]).toEqual({
        city: { type: "string" },
        missing: { minLength: 1 },
      });
    });

    it("merges declared and missing property overrides in the same flat object", () => {
      // Mix: one path-target hits an existing property and another hits a
      // missing property. Both must end up merged into a single sibling
      // properties map on the flat object (no allOf in either case).
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          {
            kind: "field",
            name: "address",
            type: {
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
            required: true,
            constraints: [
              {
                kind: "constraint",
                constraintKind: "minLength",
                value: 2,
                path: { segments: ["city"] },
                provenance: TSDOC_PROVENANCE,
              },
              {
                kind: "constraint",
                constraintKind: "minLength",
                value: 1,
                path: { segments: ["postalCode"] },
                provenance: TSDOC_PROVENANCE,
              },
            ],
            annotations: [],
            provenance: PROVENANCE,
          },
        ],
        typeRegistry: {},
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir);
      const address = schema.properties?.["address"] as Record<string, unknown> | undefined;

      expect(address?.["allOf"]).toBeUndefined();
      expect(address?.["type"]).toBe("object");
      expect(address?.["properties"]).toEqual({
        city: { type: "string", minLength: 2 },
        postalCode: { minLength: 1 },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Site 2: pre-composed `allOf` base schema
  // ---------------------------------------------------------------------------
  //
  // Pre-composed `allOf` schemas reach `applyPathTargetedConstraints` when a
  // custom-type extension returns an `allOf` schema from `toJsonSchema`. The
  // fix flattens to siblings when expressible under JSON Schema 2020-12 (i.e.,
  // the allOf has exactly one member that is a `$ref`-shaped schema whose
  // keys do not conflict with the overrides), and retains `allOf` only when
  // the composition cannot be expressed as siblings.
  //
  // @see https://github.com/mike-north/formspec/issues/382 Site 2
  describe("Site 2: pre-composed allOf base (#382)", () => {
    function makeCustomTypeRegistry(jsonSchema: Record<string, unknown>) {
      const customType = defineCustomType({
        typeName: "ComposedMoney",
        toJsonSchema: () => jsonSchema,
      });
      const extension = defineExtension({
        extensionId: "x-test/composed",
        types: [customType],
      });
      return createExtensionRegistry([extension]);
    }

    function moneyNode(): CustomTypeNode {
      return {
        kind: "custom",
        typeId: "x-test/composed/ComposedMoney",
        payload: undefined,
      };
    }

    it("flattens allOf with a single $ref member into sibling keywords", () => {
      // Base: custom type returns `{ allOf: [{ $ref: "#/$defs/X" }] }`.
      // With a path-targeted override, pre-fix output is
      // `{ allOf: [{ $ref: ... }, { properties: ... }] }`. The fix lifts the
      // $ref up and attaches the override as a sibling:
      // `{ $ref: "#/$defs/X", properties: {...} }`.
      const registry = makeCustomTypeRegistry({
        allOf: [{ $ref: "#/$defs/BaseMoney" }],
      });

      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          {
            kind: "field",
            name: "total",
            type: moneyNode(),
            required: true,
            constraints: [
              {
                kind: "constraint",
                constraintKind: "minimum",
                value: 0,
                path: { segments: ["value"] },
                provenance: TSDOC_PROVENANCE,
              },
            ],
            annotations: [],
            provenance: PROVENANCE,
          },
        ],
        typeRegistry: {},
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir, { extensionRegistry: registry });
      const totalProp = schema.properties?.["total"] as Record<string, unknown> | undefined;

      // Regression guard — must not be wrapped in allOf.
      expect(totalProp?.["allOf"]).toBeUndefined();
      // Siblings must be lifted: $ref and properties both at the top level.
      expect(totalProp?.["$ref"]).toBe("#/$defs/BaseMoney");
      expect(totalProp?.["properties"]).toEqual({ value: { minimum: 0 } });
    });

    it("retains allOf when the composition has multiple members (not expressible as siblings)", () => {
      // Genuine non-sibling composition: two independent $ref members cannot
      // both appear as siblings — one $ref per schema. `allOf` is the correct
      // shape here. This guards against over-flattening.
      const registry = makeCustomTypeRegistry({
        allOf: [{ $ref: "#/$defs/BaseA" }, { $ref: "#/$defs/BaseB" }],
      });

      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          {
            kind: "field",
            name: "total",
            type: moneyNode(),
            required: true,
            constraints: [
              {
                kind: "constraint",
                constraintKind: "minimum",
                value: 0,
                path: { segments: ["value"] },
                provenance: TSDOC_PROVENANCE,
              },
            ],
            annotations: [],
            provenance: PROVENANCE,
          },
        ],
        typeRegistry: {},
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir, { extensionRegistry: registry });
      const totalProp = schema.properties?.["total"] as Record<string, unknown> | undefined;

      // allOf is genuinely required here, and the override is appended.
      expect(totalProp?.["allOf"]).toBeDefined();
      const allOf = totalProp?.["allOf"] as Record<string, unknown>[];
      // Original members preserved, override appended.
      expect(allOf).toEqual([
        { $ref: "#/$defs/BaseA" },
        { $ref: "#/$defs/BaseB" },
        { properties: { value: { minimum: 0 } } },
      ]);
    });

    it("retains allOf when the single member has a conflicting `properties` key", () => {
      // The single allOf member declares its own `properties`, so lifting it
      // up alongside the override's `properties` would silently overwrite one
      // side. Keep `allOf` to preserve both contributions under 2020-12
      // evaluation semantics.
      const registry = makeCustomTypeRegistry({
        allOf: [
          {
            $ref: "#/$defs/BaseMoney",
            properties: { currency: { type: "string" } },
          },
        ],
      });

      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          {
            kind: "field",
            name: "total",
            type: moneyNode(),
            required: true,
            constraints: [
              {
                kind: "constraint",
                constraintKind: "minimum",
                value: 0,
                path: { segments: ["value"] },
                provenance: TSDOC_PROVENANCE,
              },
            ],
            annotations: [],
            provenance: PROVENANCE,
          },
        ],
        typeRegistry: {},
        provenance: PROVENANCE,
      };

      const schema = generateJsonSchemaFromIR(ir, { extensionRegistry: registry });
      const totalProp = schema.properties?.["total"] as Record<string, unknown> | undefined;

      // Flattening would conflict — allOf must remain.
      expect(totalProp?.["allOf"]).toBeDefined();
    });
  });
});
