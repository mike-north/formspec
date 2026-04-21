/**
 * Regression tests for issue #366: path-targeted constraints on missing
 * properties of an inline object schema must merge flat into `properties`
 * — no `allOf` wrapper — under JSON Schema 2020-12.
 *
 * Prior to the fix, any path-targeted constraint whose target property was
 * absent from `schema.properties` was composed via `allOf`, producing:
 *   { allOf: [<base>, { properties: { missing: ... } }] }
 * JSON Schema 2020-12 §10.2.1 lets us express this as a single flat
 * schema: declaring the key in `properties` legitimizes it regardless of
 * the `additionalProperties` value, so the `allOf` wrapper is never needed
 * (the broader policy is tracked by #382 Site 1).
 *
 * @see https://github.com/mike-north/formspec/issues/366
 * @see https://github.com/mike-north/formspec/issues/382
 * @see https://json-schema.org/draft/2020-12/json-schema-core
 */

import { describe, expect, it } from "vitest";
import type { AnnotationNode, ConstraintNode, FormIR, Provenance } from "@formspec/core/internals";
import { IR_VERSION } from "@formspec/core/internals";
import { generateJsonSchemaFromIR, type JsonSchema2020 } from "../json-schema/ir-generator.js";

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

/** Looks up a property on a schema and asserts it exists — returns the typed sub-schema. */
function getProperty(schema: JsonSchema2020, name: string): JsonSchema2020 {
  const value = schema.properties?.[name];
  if (value === undefined) {
    throw new Error(`expected property "${name}" to be present on schema`);
  }
  return value;
}

// =============================================================================
// TESTS
// =============================================================================

describe("inline object: path-targeted constraints on missing properties (issue #366)", () => {
  /**
   * Case 1 (the fix): missing property, additionalProperties: true.
   * The constraint target ("street") does not exist in schema.properties.
   * The fix merges the override directly into properties — no allOf wrapper.
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
    const address = getProperty(schema, "address");

    // Fix: missing property override must be merged flat — no allOf.
    expect(address.allOf).toBeUndefined();
    // The base object type keyword must remain at the top level.
    expect(address.type).toBe("object");
    // Existing property preserved.
    expect(getProperty(address, "city")).toEqual({ type: "string" });
    // Missing property added directly to properties.
    expect(getProperty(address, "street")).toEqual({ minLength: 1 });
  });

  /**
   * Case 2: additionalProperties: false — still flat-merges (no allOf).
   * Under 2020-12, declaring the new key in `properties` legitimizes it
   * regardless of the `additionalProperties` value — `additionalProperties`
   * only governs keys NOT listed in `properties` / `patternProperties`. The
   * flat merge is therefore semantically sound even on a closed base
   * (#382 Site 1 subsumes the conservative #366 allOf retention).
   */
  it("flat-merges a missing-property override even when additionalProperties is false", () => {
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
    const address = getProperty(schema, "address");

    // No allOf wrapper — the override is merged flat into `properties`.
    expect(address.allOf).toBeUndefined();
    expect(address.type).toBe("object");
    // `additionalProperties: false` is preserved as a sibling — the newly
    // declared property in `properties` is accepted by the base.
    expect(address.additionalProperties).toBe(false);
    expect(getProperty(address, "city")).toEqual({ type: "string" });
    expect(getProperty(address, "street")).toEqual({ minLength: 1 });
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
    const address = getProperty(schema, "address");

    // No allOf — the whole result is a single flat object.
    expect(address.allOf).toBeUndefined();
    expect(address.type).toBe("object");

    // Existing property gets the override merged in.
    expect(getProperty(address, "zip")).toEqual({ type: "string", pattern: "^\\d{5}$" });

    // Missing property gets added directly to properties.
    expect(getProperty(address, "street")).toEqual({ minLength: 1 });
  });

  /**
   * Two path-targeted constraints on the SAME missing property.
   * `buildPropertyOverrides` groups them by first path segment, so both
   * keywords are combined into a single override schema before application.
   * The emitted object should therefore stay flat — no allOf — with both
   * constraints present on `properties.street`. The flat-merge branch does a
   * shallow clone of the override so the caller's object is not aliased into
   * the emitted IR; this test guards against a shared-reference regression.
   */
  it("accumulates multiple missing-property overrides on the same path without aliasing", () => {
    const ir = makeIR([
      {
        kind: "field",
        name: "address",
        type: {
          kind: "object",
          properties: [],
          additionalProperties: true,
        },
        required: true,
        constraints: [makePathMinLength(["street"], 1), makePathPattern(["street"], "^\\d+")],
        annotations: NO_ANNOTATIONS,
        provenance: PROVENANCE,
      },
    ]);

    const schema = generateJsonSchemaFromIR(ir);
    const address = getProperty(schema, "address");

    expect(address.allOf).toBeUndefined();
    // Both constraints must land on the same property.
    expect(getProperty(address, "street")).toEqual({ minLength: 1, pattern: "^\\d+" });
  });

  /**
   * Multiple distinct missing-property overrides in a single call. Each
   * should land flat in `properties`, with no stray `allOf`.
   */
  it("merges multiple distinct missing-property overrides flat into properties", () => {
    const ir = makeIR([
      {
        kind: "field",
        name: "address",
        type: {
          kind: "object",
          properties: [],
          additionalProperties: true,
        },
        required: true,
        constraints: [makePathMinLength(["street"], 1), makePathMinLength(["city"], 2)],
        annotations: NO_ANNOTATIONS,
        provenance: PROVENANCE,
      },
    ]);

    const schema = generateJsonSchemaFromIR(ir);
    const address = getProperty(schema, "address");

    expect(address.allOf).toBeUndefined();
    expect(getProperty(address, "street")).toEqual({ minLength: 1 });
    expect(getProperty(address, "city")).toEqual({ minLength: 2 });
  });

  /**
   * Multi-segment path where the FIRST segment is a missing top-level property.
   * `buildPropertyOverrides` produces a nested override
   * (`{ address: { properties: { street: { minLength: 1 } } } }`); the
   * open-base branch must materialise that whole nested structure flat under
   * `schema.properties` without generating an `allOf`.
   */
  it("flat-merges a nested override when the first path segment is missing", () => {
    const ir = makeIR([
      {
        kind: "field",
        name: "profile",
        type: {
          kind: "object",
          properties: [],
          additionalProperties: true,
        },
        required: true,
        constraints: [makePathMinLength(["address", "street"], 1)],
        annotations: NO_ANNOTATIONS,
        provenance: PROVENANCE,
      },
    ]);

    const schema = generateJsonSchemaFromIR(ir);
    const profile = getProperty(schema, "profile");

    expect(profile.allOf).toBeUndefined();
    expect(profile.type).toBe("object");
    // The nested override must be flat at .properties.address.properties.street.
    const address = getProperty(profile, "address");
    expect(getProperty(address, "street")).toEqual({ minLength: 1 });
  });

  /**
   * Path-targeted constraint on a missing property of an inline object
   * embedded inside an array. `applyPathTargetedConstraints` recurses through
   * the array branch into `items`, which is the inline object we fix here.
   * The item schema should flat-merge the missing override — no stray
   * `allOf` at either the array or item level.
   */
  it("flat-merges a missing-property override on an inline object inside an array", () => {
    const ir = makeIR([
      {
        kind: "field",
        name: "contacts",
        type: {
          kind: "array",
          items: {
            kind: "object",
            properties: [
              {
                name: "name",
                type: { kind: "primitive", primitiveKind: "string" },
                optional: false,
                constraints: [],
                annotations: NO_ANNOTATIONS,
                provenance: PROVENANCE,
              },
            ],
            additionalProperties: true,
          },
        },
        required: true,
        constraints: [makePathMinLength(["email"], 1)],
        annotations: NO_ANNOTATIONS,
        provenance: PROVENANCE,
      },
    ]);

    const schema = generateJsonSchemaFromIR(ir);
    const contacts = getProperty(schema, "contacts");

    expect(contacts.allOf).toBeUndefined();
    expect(contacts.type).toBe("array");
    const items = contacts.items;
    if (items === undefined) throw new Error("expected items schema to be present");
    expect(items.allOf).toBeUndefined();
    expect(items.type).toBe("object");
    expect(getProperty(items, "name")).toEqual({ type: "string" });
    expect(getProperty(items, "email")).toEqual({ minLength: 1 });
  });

  /**
   * Nullable union (`T | null`) wrapping an inline object. The nullable
   * branch in `applyPathTargetedConstraints` recurses into the non-null arm;
   * that arm then takes the open-object path and must flat-merge the
   * missing-property override. The outer schema stays a `oneOf` with two
   * branches (object + null) — no `allOf` is introduced.
   */
  it("flat-merges a missing-property override inside a nullable-union branch", () => {
    const ir = makeIR([
      {
        kind: "field",
        name: "address",
        type: {
          kind: "union",
          members: [
            {
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
            { kind: "primitive", primitiveKind: "null" },
          ],
        },
        required: true,
        constraints: [makePathMinLength(["street"], 1)],
        annotations: NO_ANNOTATIONS,
        provenance: PROVENANCE,
      },
    ]);

    const schema = generateJsonSchemaFromIR(ir);
    const address = getProperty(schema, "address");

    expect(address.allOf).toBeUndefined();
    const oneOf = address.oneOf;
    if (oneOf === undefined) throw new Error("expected nullable oneOf to be preserved");
    expect(oneOf).toHaveLength(2);

    const objectBranch = oneOf.find((branch) => branch.type === "object");
    const nullBranch = oneOf.find((branch) => branch.type === "null");
    if (objectBranch === undefined) throw new Error("expected non-null object branch");
    if (nullBranch === undefined) throw new Error("expected null branch to be preserved");

    // The non-null arm carries the flat merge of the existing and missing properties.
    expect(objectBranch.allOf).toBeUndefined();
    expect(getProperty(objectBranch, "city")).toEqual({ type: "string" });
    expect(getProperty(objectBranch, "street")).toEqual({ minLength: 1 });
  });
});
