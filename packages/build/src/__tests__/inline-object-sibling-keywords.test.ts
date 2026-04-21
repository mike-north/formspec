/**
 * Regression tests for issue #366: path-targeted constraints on missing
 * properties of an inline object schema should merge flat into `properties`
 * (no `allOf`) when `additionalProperties` is not `false`.
 *
 * Prior to the fix, any path-targeted constraint whose target property was
 * absent from `schema.properties` was composed via `allOf`, producing:
 *   { allOf: [<base>, { properties: { missing: ... } }] }
 * Under JSON Schema 2020-12, when `additionalProperties` is `true` or
 * omitted, merging directly into `properties` is semantically equivalent
 * and avoids the `allOf` wrapper.
 *
 * @see https://github.com/mike-north/formspec/issues/366
 * @see https://json-schema.org/draft/2020-12/json-schema-core
 */

import { describe, expect, it } from "vitest";
import type { AnnotationNode, ConstraintNode, FormIR, Provenance } from "@formspec/core/internals";
import { IR_VERSION } from "@formspec/core/internals";
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

/** Builds a minimal FormIR with the given elements. */
function makeIR(elements: FormIR["elements"]): FormIR {
  return {
    kind: "form-ir",
    irVersion: IR_VERSION,
    elements,
    typeRegistry: {},
    provenance: PROVENANCE,
  };
}

/** Builds a path-targeted minLength constraint. */
function makePathMinLength(segments: string[], value: number): ConstraintNode {
  return {
    kind: "constraint",
    constraintKind: "minLength",
    value,
    path: { segments },
    provenance: {
      surface: "tsdoc",
      file: "/test.ts",
      line: 1,
      column: 0,
      tagName: "@minLength",
    },
  };
}

/** Builds a path-targeted pattern constraint. */
function makePathPattern(segments: string[], pattern: string): ConstraintNode {
  return {
    kind: "constraint",
    constraintKind: "pattern",
    pattern,
    path: { segments },
    provenance: {
      surface: "tsdoc",
      file: "/test.ts",
      line: 1,
      column: 0,
      tagName: "@pattern",
    },
  };
}

/** Empty annotation list for brevity. */
const NO_ANNOTATIONS: AnnotationNode[] = [];

// =============================================================================
// TESTS
// =============================================================================

describe("inline object: path-targeted constraints on missing properties (issue #366)", () => {
  /**
   * Case 1 (the fix): missing property, additionalProperties: true.
   * The constraint target ("street") does not exist in schema.properties,
   * but additionalProperties allows extra keys. The fix merges the override
   * directly into properties — no allOf wrapper.
   */
  it("merges missing-property override flat into properties when additionalProperties is true", () => {
    const ir = makeIR([
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
              annotations: NO_ANNOTATIONS,
              provenance: PROVENANCE,
            },
          ],
          additionalProperties: true,
        },
        required: true,
        constraints: [makePathMinLength(["street"], 1)],
        annotations: NO_ANNOTATIONS,
        provenance: PROVENANCE,
      },
    ]);

    const schema = generateJsonSchemaFromIR(ir);
    const address = (schema.properties as Record<string, unknown>)["address"] as Record<
      string,
      unknown
    >;

    // Fix: missing property override must be merged flat — no allOf.
    expect(address["allOf"]).toBeUndefined();
    // The base object type keyword must remain at the top level.
    expect(address["type"]).toBe("object");
    // Existing property preserved.
    expect((address["properties"] as Record<string, unknown>)["city"]).toEqual({
      type: "string",
    });
    // Missing property added directly to properties.
    expect((address["properties"] as Record<string, unknown>)["street"]).toEqual({ minLength: 1 });
  });

  /**
   * Case 2: additionalProperties: false — must retain allOf wrapping.
   * Merging a new property into `properties` on an additionalProperties:false
   * base still rejects values that provide that property (unless explicitly
   * listed), so we keep the pre-fix allOf composition as the least-wrong
   * behavior until a follow-up introduces a proper warning.
   */
  it("retains allOf wrapping when additionalProperties is false (intended pre-fix behavior)", () => {
    const ir = makeIR([
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
              annotations: NO_ANNOTATIONS,
              provenance: PROVENANCE,
            },
          ],
          additionalProperties: false,
        },
        required: true,
        constraints: [makePathMinLength(["street"], 1)],
        annotations: NO_ANNOTATIONS,
        provenance: PROVENANCE,
      },
    ]);

    const schema = generateJsonSchemaFromIR(ir);
    const address = (schema.properties as Record<string, unknown>)["address"] as Record<
      string,
      unknown
    >;

    // Retained behavior: allOf composition is used to avoid widening the
    // additionalProperties:false constraint on the base object.
    expect(address["allOf"]).toBeDefined();
    // The base object lives inside allOf[0], not at top level.
    expect(address["type"]).toBeUndefined();
  });

  /**
   * Mixed case: one property exists in the base, another does not.
   * Both should end up in the flat properties object — no allOf.
   *
   * - "zip" already exists → merged via mergeSchemaOverride (existing path)
   * - "street" is missing, additionalProperties: true → merged flat (new path)
   * Result should be a single flat object with no allOf.
   */
  it("produces a single flat object when mixing existing and missing property overrides", () => {
    const ir = makeIR([
      {
        kind: "field",
        name: "address",
        type: {
          kind: "object",
          properties: [
            {
              name: "zip",
              type: { kind: "primitive", primitiveKind: "string" },
              optional: false,
              constraints: [],
              annotations: NO_ANNOTATIONS,
              provenance: PROVENANCE,
            },
          ],
          additionalProperties: true,
        },
        required: true,
        constraints: [makePathPattern(["zip"], "^\\d{5}$"), makePathMinLength(["street"], 1)],
        annotations: NO_ANNOTATIONS,
        provenance: PROVENANCE,
      },
    ]);

    const schema = generateJsonSchemaFromIR(ir);
    const address = (schema.properties as Record<string, unknown>)["address"] as Record<
      string,
      unknown
    >;
    const properties = address["properties"] as Record<string, unknown>;

    // No allOf — the whole result is a single flat object.
    expect(address["allOf"]).toBeUndefined();
    expect(address["type"]).toBe("object");

    // Existing property gets the override merged in.
    expect(properties["zip"]).toEqual({ type: "string", pattern: "^\\d{5}$" });

    // Missing property gets added directly to properties.
    expect(properties["street"]).toEqual({ minLength: 1 });
  });
});
