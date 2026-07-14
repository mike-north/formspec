/**
 * Integration coverage that proves generated UI Schema scopes resolve to the
 * intended property when consumed by JSON Forms' own JSON Pointer resolver.
 *
 * JSON Forms treats a control/rule `scope` as an RFC 6901 JSON Pointer: it
 * splits on `/` and decodes each segment (`~1` → `/`, `~0` → `~`) before
 * walking the JSON Schema. We generate both the JSON Schema and the UI Schema
 * from the same IR, then hand JSON Forms the exact scope strings we emit and
 * assert they land on the property node we intended. This exercises the real
 * consumer contract rather than re-asserting our own encode/decode.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc6901
 * @see https://jsonforms.io/docs/uischema/controls
 */
import { describe, it, expect } from "vitest";
import { resolveSchema, type JsonSchema } from "@jsonforms/core";
import type { FormIR, FieldNode, Provenance } from "@formspec/core/internals";
import type { ControlElement, UISchemaElement } from "../src/ui-schema/types.js";
import { generateUiSchemaFromIR } from "../src/ui-schema/ir-generator.js";
import { generateJsonSchemaFromIR } from "../src/json-schema/ir-generator.js";

// =============================================================================
// HELPERS
// =============================================================================

const CHAIN_DSL_PROVENANCE: Provenance = {
  surface: "chain-dsl",
  file: "",
  line: 0,
  column: 0,
};

function fieldNode(name: string): FieldNode {
  return {
    kind: "field",
    name,
    type: { kind: "primitive", primitiveKind: "string" },
    required: false,
    constraints: [],
    annotations: [],
    provenance: CHAIN_DSL_PROVENANCE,
  };
}

function formIR(elements: FormIR["elements"]): FormIR {
  return {
    kind: "form-ir",
    irVersion: "0.1.0",
    elements,
    typeRegistry: {},
    provenance: CHAIN_DSL_PROVENANCE,
  };
}

function conditionalNode(
  fieldName: string,
  value: string,
  elements: FormIR["elements"]
): FormIR["elements"][number] {
  return {
    kind: "conditional",
    fieldName,
    value,
    elements,
    provenance: CHAIN_DSL_PROVENANCE,
  };
}

function firstControl(elements: readonly UISchemaElement[]): ControlElement {
  const control = elements[0];
  if (control?.type !== "Control") {
    throw new Error("Expected a Control element at index 0");
  }
  return control;
}

/** Resolve a JSON Forms scope against a generated JSON Schema. */
function resolve(jsonSchema: unknown, scope: string): JsonSchema | undefined {
  const root = jsonSchema as JsonSchema;
  return resolveSchema(root, scope, root);
}

// =============================================================================
// TESTS
// =============================================================================

describe("JSON Forms scope resolution for RFC 6901-escaped property names", () => {
  // Names JSON Forms can resolve with a single-pass decode. Its own `decode`
  // only replaces the first `~0`, so multi-tilde names are intentionally left
  // to the encode/decode unit tests; here we cover names with at most one `~`.
  const specialNames = ["a/b", "a~b", "first name", "café", "路径", "a?b=1&c", "a%2Fb"];

  for (const name of specialNames) {
    it(`resolves a control scope for a field named ${JSON.stringify(name)}`, () => {
      const ir = formIR([fieldNode(name)]);
      const jsonSchema = generateJsonSchemaFromIR(ir);
      const uiSchema = generateUiSchemaFromIR(ir);

      // Sanity: the JSON Schema keys the property by its literal (unescaped) name.
      const properties = (jsonSchema as { properties?: Record<string, unknown> }).properties;
      expect(properties?.[name]).toBeDefined();

      const control = firstControl(uiSchema.elements);
      const resolved = resolve(jsonSchema, control.scope);

      // The scope must resolve to exactly the intended property node.
      expect(resolved).toBeDefined();
      expect(resolved).toEqual(properties?.[name]);
    });
  }

  it("resolves a rule condition scope to the controlling property", () => {
    // The controlling field `a/b` must exist in the schema for its condition
    // scope to resolve, so it is declared alongside the conditional it drives.
    const ir = formIR([fieldNode("a/b"), conditionalNode("a/b", "draft", [fieldNode("notes")])]);
    const jsonSchema = generateJsonSchemaFromIR(ir);
    const uiSchema = generateUiSchemaFromIR(ir);

    // The conditional's child (notes) is the second element; index 0 is `a/b`.
    const notes = uiSchema.elements[1];
    if (notes?.type !== "Control") {
      throw new Error("Expected the conditional child Control at index 1");
    }
    const control = notes;
    const ruleScope = control.rule?.condition.scope;
    expect(ruleScope).toBe("#/properties/a~1b");

    const resolved = resolve(jsonSchema, ruleScope ?? "");
    const properties = (jsonSchema as { properties?: Record<string, unknown> }).properties;
    expect(resolved).toBeDefined();
    expect(resolved).toEqual(properties?.["a/b"]);
  });

  it("would resolve to the wrong node without escaping (regression guard)", () => {
    // Demonstrates why escaping is required: a naive unescaped scope for a
    // field named `a/b` reads as segments `a` then `b` and fails to resolve.
    const ir = formIR([fieldNode("a/b")]);
    const jsonSchema = generateJsonSchemaFromIR(ir);
    const uiSchema = generateUiSchemaFromIR(ir);

    const control = firstControl(uiSchema.elements);
    // The emitted (escaped) scope resolves.
    expect(resolve(jsonSchema, control.scope)).toBeDefined();
    // The pre-fix (unescaped) scope does not.
    expect(resolve(jsonSchema, "#/properties/a/b")).toBeUndefined();
  });
});
