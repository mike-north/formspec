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
  Provenance,
} from "@formspec/core/internals";
import { IR_VERSION } from "@formspec/core/internals";
import { generateJsonSchemaFromIR } from "../json-schema/ir-generator.js";

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
      expect(totalProp?.["$ref"]).toBe("#/$defs/MonetaryAmount");

      // The property override must appear alongside $ref, not wrapped in allOf.
      expect(totalProp?.["properties"]).toEqual({ value: { exclusiveMinimum: 0 } });

      // The allOf wrapper must NOT be present — this is the key regression guard.
      // spec: JSON Schema 2020-12 §10.2.1 allows sibling keywords next to $ref.
      expect(totalProp?.["allOf"]).toBeUndefined();
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

      expect(totalProp?.["$ref"]).toBe("#/$defs/MonetaryAmount");
      expect(totalProp?.["properties"]).toEqual({ value: { minimum: 0 } });
      expect(totalProp?.["allOf"]).toBeUndefined();
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
      expect(totalProp?.["$ref"]).toBe("#/$defs/MonetaryAmount");
      expect(totalProp?.["title"]).toBe("Total Amount");
      expect(totalProp?.["properties"]).toEqual({ value: { exclusiveMinimum: 0 } });
      expect(totalProp?.["allOf"]).toBeUndefined();
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
      expect(schema.properties?.["subtotal"]?.["$ref"]).toBe("#/$defs/MonetaryAmount");
      expect(schema.properties?.["total"]?.["$ref"]).toBe("#/$defs/MonetaryAmount");
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
      const lineItemsItems = schema.properties?.["lineItems"]?.["items"];

      expect((lineItemsItems as Record<string, unknown>)?.["$ref"]).toBe(
        "#/$defs/MonetaryAmount"
      );
      expect((lineItemsItems as Record<string, unknown>)?.["properties"]).toEqual({
        value: { minimum: 0 },
      });
      // No allOf wrapping on the items schema either.
      expect((lineItemsItems as Record<string, unknown>)?.["allOf"]).toBeUndefined();
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

      expect(totalProp?.["$ref"]).toBe("#/$defs/MonetaryAmount");
      expect(totalProp?.["properties"]).toEqual({
        value: { minimum: 0 },
        currency: { maxLength: 3 },
      });
      expect(totalProp?.["allOf"]).toBeUndefined();
    });
  });
});
