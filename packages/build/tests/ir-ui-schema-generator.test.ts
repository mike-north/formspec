/**
 * Tests for the IR-based UI Schema generator (`generateUiSchemaFromIR`).
 *
 * Each test constructs a `FormIR` directly and asserts on the resulting
 * UI Schema structure. No round-trip comparison against legacy output.
 */
import { describe, it, expect } from "vitest";
import { formspec, field, group, when, is } from "@formspec/dsl";
import type {
  FormIR,
  FieldNode,
  GroupLayoutNode,
  ConditionalLayoutNode,
  Provenance,
} from "@formspec/core/internals";
import type { UISchemaElement, ControlElement, GroupLayout, Rule } from "../src/ui-schema/types.js";
import { generateUiSchemaFromIR } from "../src/ui-schema/ir-generator.js";
import { canonicalizeChainDSL } from "../src/canonicalize/index.js";

// =============================================================================
// HELPERS
// =============================================================================

const CHAIN_DSL_PROVENANCE: Provenance = {
  surface: "chain-dsl",
  file: "",
  line: 0,
  column: 0,
};

/**
 * Safely access an array element by index, throwing if out of bounds.
 * Satisfies `noUncheckedIndexedAccess` without non-null assertions.
 */
function at<T>(arr: readonly T[], index: number): T {
  const value = arr[index];
  if (value === undefined) {
    throw new Error(
      `Expected element at index ${String(index)}, but array has length ${String(arr.length)}`
    );
  }
  return value;
}

function isControlElement(el: UISchemaElement): el is ControlElement {
  return el.type === "Control";
}

function isGroupLayout(el: UISchemaElement): el is GroupLayout {
  return el.type === "Group";
}

/** Narrow a UISchemaElement to ControlElement and assert type. */
function expectControl(elements: readonly UISchemaElement[], index: number): ControlElement {
  const el = at(elements, index);
  if (!isControlElement(el)) {
    throw new Error(`Expected Control at index ${String(index)}, got ${el.type}`);
  }
  return el;
}

/** Narrow a UISchemaElement to GroupLayout and assert type. */
function expectGroupLayout(elements: readonly UISchemaElement[], index: number): GroupLayout {
  const el = at(elements, index);
  if (!isGroupLayout(el)) {
    throw new Error(`Expected Group at index ${String(index)}, got ${el.type}`);
  }
  return el;
}

/** Build a minimal FormIR with no elements, suitable for empty-form tests. */
function emptyFormIR(): FormIR {
  return {
    kind: "form-ir",
    irVersion: "0.1.0",
    elements: [],
    typeRegistry: {},
    provenance: CHAIN_DSL_PROVENANCE,
  };
}

/** Build a minimal FormIR from a list of pre-constructed IR elements. */
function formIRFromElements(elements: FormIR["elements"]): FormIR {
  return {
    kind: "form-ir",
    irVersion: "0.1.0",
    elements,
    typeRegistry: {},
    provenance: CHAIN_DSL_PROVENANCE,
  };
}

/** Build a FieldNode with no annotations, constraints, or provenance detail. */
function simpleFieldNode(name: string): FieldNode {
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

/** Build a FieldNode with resolved metadata. */
function labelledFieldNode(name: string, label: string): FieldNode {
  return {
    ...simpleFieldNode(name),
    metadata: {
      displayName: {
        value: label,
        source: "explicit",
      },
    },
  };
}

/** Build a GroupLayoutNode wrapping the given elements. */
function groupNode(label: string, elements: FormIR["elements"]): GroupLayoutNode {
  return {
    kind: "group",
    label,
    elements,
    provenance: CHAIN_DSL_PROVENANCE,
  };
}

/** Build a ConditionalLayoutNode. */
function conditionalNode(
  fieldName: string,
  value: string,
  elements: FormIR["elements"]
): ConditionalLayoutNode {
  return {
    kind: "conditional",
    fieldName,
    value,
    elements,
    provenance: CHAIN_DSL_PROVENANCE,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe("generateUiSchemaFromIR", () => {
  // ---------------------------------------------------------------------------
  // 1. Empty form
  // ---------------------------------------------------------------------------

  describe("empty form", () => {
    it("should produce a VerticalLayout with no elements", () => {
      const result = generateUiSchemaFromIR(emptyFormIR());

      expect(result).toEqual({ type: "VerticalLayout", elements: [] });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Simple field → Control with correct scope
  // ---------------------------------------------------------------------------

  describe("simple field", () => {
    it("should produce a Control element with the correct scope", () => {
      const ir = formIRFromElements([simpleFieldNode("name")]);
      const result = generateUiSchemaFromIR(ir);

      expect(result.type).toBe("VerticalLayout");
      expect(result.elements).toHaveLength(1);

      const control = expectControl(result.elements, 0);
      expect(control.scope).toBe("#/properties/name");
    });

    it("should not include a label when no displayName annotation is present", () => {
      const ir = formIRFromElements([simpleFieldNode("email")]);
      const result = generateUiSchemaFromIR(ir);

      const control = expectControl(result.elements, 0);
      expect(control.label).toBeUndefined();
    });

    it("should not include a rule on an unconditional field", () => {
      const ir = formIRFromElements([simpleFieldNode("active")]);
      const result = generateUiSchemaFromIR(ir);

      const control = expectControl(result.elements, 0);
      expect(control.rule).toBeUndefined();
    });

    it("should encode field names with underscores correctly in scope", () => {
      const ir = formIRFromElements([simpleFieldNode("my_field")]);
      const result = generateUiSchemaFromIR(ir);

      const control = expectControl(result.elements, 0);
      expect(control.scope).toBe("#/properties/my_field");
    });

    it("should produce multiple Control elements for multiple top-level fields", () => {
      const ir = formIRFromElements([
        simpleFieldNode("first"),
        simpleFieldNode("second"),
        simpleFieldNode("third"),
      ]);
      const result = generateUiSchemaFromIR(ir);

      expect(result.elements).toHaveLength(3);
      expect(expectControl(result.elements, 0).scope).toBe("#/properties/first");
      expect(expectControl(result.elements, 1).scope).toBe("#/properties/second");
      expect(expectControl(result.elements, 2).scope).toBe("#/properties/third");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Field with label annotation → Control with label
  // ---------------------------------------------------------------------------

  describe("field with displayName annotation", () => {
    it("should include the label on the Control element", () => {
      const ir = formIRFromElements([labelledFieldNode("name", "Full Name")]);
      const result = generateUiSchemaFromIR(ir);

      const control = expectControl(result.elements, 0);
      expect(control.label).toBe("Full Name");
    });

    it("should use the first displayName annotation when multiple annotations are present", () => {
      const fieldNode: FieldNode = {
        ...simpleFieldNode("field"),
        metadata: {
          displayName: {
            value: "First Label",
            source: "explicit",
          },
        },
        annotations: [
          {
            kind: "annotation",
            annotationKind: "placeholder",
            value: "Enter value",
            provenance: CHAIN_DSL_PROVENANCE,
          },
        ],
      };
      const ir = formIRFromElements([fieldNode]);
      const result = generateUiSchemaFromIR(ir);

      const control = expectControl(result.elements, 0);
      expect(control.label).toBe("First Label");
    });

    it("should not produce a label when only non-displayName annotations are present", () => {
      const fieldNode: FieldNode = {
        ...simpleFieldNode("field"),
        annotations: [
          {
            kind: "annotation",
            annotationKind: "placeholder",
            value: "Enter value",
            provenance: CHAIN_DSL_PROVENANCE,
          },
        ],
      };
      const ir = formIRFromElements([fieldNode]);
      const result = generateUiSchemaFromIR(ir);

      const control = expectControl(result.elements, 0);
      expect(control.label).toBeUndefined();
    });

    it("falls back to displayName annotations when resolved metadata is absent", () => {
      const fieldNode: FieldNode = {
        ...simpleFieldNode("legacyField"),
        annotations: [
          {
            kind: "annotation",
            annotationKind: "displayName",
            value: "Legacy Label",
            provenance: CHAIN_DSL_PROVENANCE,
          },
        ],
      };

      const result = generateUiSchemaFromIR(formIRFromElements([fieldNode]));

      expect(expectControl(result.elements, 0).label).toBe("Legacy Label");
    });

    it("should map placeholder annotations to options.placeholder", () => {
      const fieldNode: FieldNode = {
        ...simpleFieldNode("email"),
        annotations: [
          {
            kind: "annotation",
            annotationKind: "placeholder",
            value: "Enter your email",
            provenance: CHAIN_DSL_PROVENANCE,
          },
        ],
      };
      const ir = formIRFromElements([fieldNode]);
      const result = generateUiSchemaFromIR(ir);

      const control = expectControl(result.elements, 0);
      expect(control.options).toEqual({ placeholder: "Enter your email" });
    });

    it("should use serialized names in control scopes and conditional rules", () => {
      const ir = formIRFromElements([
        {
          ...simpleFieldNode("status"),
          metadata: {
            apiName: { value: "status_code", source: "explicit" },
            displayName: { value: "Status", source: "explicit" },
          },
          type: {
            kind: "enum",
            members: [{ value: "draft" }, { value: "sent" }],
          },
        },
        conditionalNode("status", "draft", [
          {
            ...simpleFieldNode("notes"),
            metadata: {
              apiName: { value: "internal_notes", source: "explicit" },
              displayName: { value: "Internal Notes", source: "explicit" },
            },
          },
        ]),
      ]);

      const result = generateUiSchemaFromIR(ir);

      expect(expectControl(result.elements, 0)).toMatchObject({
        scope: "#/properties/status_code",
        label: "Status",
      });
      expect(expectControl(result.elements, 1)).toMatchObject({
        scope: "#/properties/internal_notes",
        label: "Internal Notes",
        rule: {
          effect: "SHOW",
          condition: {
            scope: "#/properties/status_code",
            schema: { const: "draft" },
          },
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Group → GroupLayout with nested elements
  // ---------------------------------------------------------------------------

  describe("group", () => {
    it("should produce a GroupLayout with the correct label", () => {
      const ir = formIRFromElements([
        groupNode("Personal Info", [simpleFieldNode("name"), simpleFieldNode("age")]),
      ]);
      const result = generateUiSchemaFromIR(ir);

      expect(result.elements).toHaveLength(1);
      const groupEl = expectGroupLayout(result.elements, 0);
      expect(groupEl.label).toBe("Personal Info");
    });

    it("should recursively convert nested elements inside a group", () => {
      const ir = formIRFromElements([
        groupNode("Customer", [
          labelledFieldNode("name", "Name"),
          labelledFieldNode("email", "Email"),
        ]),
      ]);
      const result = generateUiSchemaFromIR(ir);

      const groupEl = expectGroupLayout(result.elements, 0);
      expect(groupEl.elements).toHaveLength(2);

      const nameControl = expectControl(groupEl.elements, 0);
      expect(nameControl.scope).toBe("#/properties/name");
      expect(nameControl.label).toBe("Name");

      const emailControl = expectControl(groupEl.elements, 1);
      expect(emailControl.scope).toBe("#/properties/email");
      expect(emailControl.label).toBe("Email");
    });

    it("should not attach a rule to a group that is not inside a conditional", () => {
      const ir = formIRFromElements([groupNode("Section", [simpleFieldNode("field1")])]);
      const result = generateUiSchemaFromIR(ir);

      const groupEl = expectGroupLayout(result.elements, 0);
      expect(groupEl.rule).toBeUndefined();
    });

    it("should produce an empty elements array for an empty group", () => {
      const ir = formIRFromElements([groupNode("Empty", [])]);
      const result = generateUiSchemaFromIR(ir);

      const groupEl = expectGroupLayout(result.elements, 0);
      expect(groupEl.elements).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Conditional → children get SHOW rule
  // ---------------------------------------------------------------------------

  describe("conditional", () => {
    it("should flatten conditional children into the parent container", () => {
      const ir = formIRFromElements([
        simpleFieldNode("status"),
        conditionalNode("status", "draft", [simpleFieldNode("notes")]),
      ]);
      const result = generateUiSchemaFromIR(ir);

      // The conditional itself is not an element — its children are flattened
      expect(result.elements).toHaveLength(2);
      expect(at(result.elements, 0).type).toBe("Control");
      expect(at(result.elements, 1).type).toBe("Control");
    });

    it("should attach a SHOW rule to each child of a conditional", () => {
      const ir = formIRFromElements([
        conditionalNode("status", "draft", [simpleFieldNode("notes"), simpleFieldNode("refs")]),
      ]);
      const result = generateUiSchemaFromIR(ir);

      expect(result.elements).toHaveLength(2);

      const expectedRule: Rule = {
        effect: "SHOW",
        condition: {
          scope: "#/properties/status",
          schema: { const: "draft" },
        },
      };

      const notesControl = expectControl(result.elements, 0);
      expect(notesControl.rule).toEqual(expectedRule);

      const refsControl = expectControl(result.elements, 1);
      expect(refsControl.rule).toEqual(expectedRule);
    });

    it("should set the correct scope on the rule condition", () => {
      const ir = formIRFromElements([
        conditionalNode("type", "premium", [simpleFieldNode("discount")]),
      ]);
      const result = generateUiSchemaFromIR(ir);

      const control = expectControl(result.elements, 0);
      expect(control.rule?.condition.scope).toBe("#/properties/type");
    });

    it("should set the correct const value on the rule condition schema", () => {
      const ir = formIRFromElements([conditionalNode("count", "5", [simpleFieldNode("extra")])]);
      const result = generateUiSchemaFromIR(ir);

      const control = expectControl(result.elements, 0);
      expect(control.rule?.condition.schema).toEqual({ const: "5" });
    });

    it("should attach the conditional rule to a Group nested inside a conditional", () => {
      const ir = formIRFromElements([
        conditionalNode("status", "active", [
          groupNode("Active Section", [simpleFieldNode("field1")]),
        ]),
      ]);
      const result = generateUiSchemaFromIR(ir);

      // The group is a flattened child of the conditional
      expect(result.elements).toHaveLength(1);
      const groupEl = expectGroupLayout(result.elements, 0);
      expect(groupEl.rule).toEqual({
        effect: "SHOW",
        condition: { scope: "#/properties/status", schema: { const: "active" } },
      });
    });

    it("should also apply the rule to nested fields inside a conditionally-shown group", () => {
      const ir = formIRFromElements([
        conditionalNode("mode", "advanced", [groupNode("Advanced", [simpleFieldNode("detail")])]),
      ]);
      const result = generateUiSchemaFromIR(ir);

      const groupEl = expectGroupLayout(result.elements, 0);
      // The nested field inside the group gets the rule too
      const nestedControl = expectControl(groupEl.elements, 0);
      expect(nestedControl.rule).toEqual({
        effect: "SHOW",
        condition: { scope: "#/properties/mode", schema: { const: "advanced" } },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Nested conditional → combined allOf rule
  // ---------------------------------------------------------------------------

  describe("nested conditional", () => {
    it("should combine parent and child conditional rules using allOf", () => {
      const ir = formIRFromElements([
        conditionalNode("status", "draft", [
          conditionalNode("type", "internal", [simpleFieldNode("secret")]),
        ]),
      ]);
      const result = generateUiSchemaFromIR(ir);

      expect(result.elements).toHaveLength(1);
      const control = expectControl(result.elements, 0);

      expect(control.rule).toBeDefined();
      expect(control.rule?.effect).toBe("SHOW");
      expect(control.rule?.condition.scope).toBe("#");
      expect(control.rule?.condition.schema).toEqual({
        allOf: [
          { properties: { status: { const: "draft" } } },
          { properties: { type: { const: "internal" } } },
        ],
      });
    });

    it("should produce allOf with both parent and child field names as property keys", () => {
      const ir = formIRFromElements([
        conditionalNode("category", "A", [
          conditionalNode("subcategory", "X", [simpleFieldNode("detail")]),
        ]),
      ]);
      const result = generateUiSchemaFromIR(ir);

      const control = expectControl(result.elements, 0);
      const allOf = control.rule?.condition.schema.allOf;
      expect(allOf).toHaveLength(2);

      expect(at(allOf ?? [], 0)).toEqual({ properties: { category: { const: "A" } } });
      expect(at(allOf ?? [], 1)).toEqual({ properties: { subcategory: { const: "X" } } });
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Object field → single Control (via canonicalizeChainDSL)
  // ---------------------------------------------------------------------------

  describe("object field", () => {
    it("should produce a single Control for an object field (not a GroupLayout)", () => {
      const ir = canonicalizeChainDSL(
        formspec(field.object("address", field.text("street"), field.text("city")))
      );
      const result = generateUiSchemaFromIR(ir);

      // An object field is a single Control pointing to the object property,
      // not a GroupLayout — it is up to the renderer to handle nested display.
      expect(result.elements).toHaveLength(1);
      const control = expectControl(result.elements, 0);
      expect(control.scope).toBe("#/properties/address");
    });

    it("should not include sub-properties as separate controls for an object field", () => {
      const ir = canonicalizeChainDSL(
        formspec(field.object("person", field.text("firstName"), field.text("lastName")))
      );
      const result = generateUiSchemaFromIR(ir);

      expect(result.elements).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Array field → single Control (via canonicalizeChainDSL)
  // ---------------------------------------------------------------------------

  describe("array field", () => {
    it("should produce a single Control for an array field", () => {
      const ir = canonicalizeChainDSL(
        formspec(field.array("items", field.text("description"), field.number("qty")))
      );
      const result = generateUiSchemaFromIR(ir);

      expect(result.elements).toHaveLength(1);
      const control = expectControl(result.elements, 0);
      expect(control.scope).toBe("#/properties/items");
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Output validation
  // ---------------------------------------------------------------------------

  describe("output validation", () => {
    it("should pass Zod validation on complex output without throwing", () => {
      const ir = canonicalizeChainDSL(
        formspec(
          group("Section", field.text("a", { label: "A" }), field.number("b")),
          when(is("a", "x"), field.boolean("c"))
        )
      );

      // Should not throw — Zod validation is performed internally
      expect(() => generateUiSchemaFromIR(ir)).not.toThrow();
    });

    it("should produce a VerticalLayout root for any valid form IR", () => {
      const ir = canonicalizeChainDSL(
        formspec(field.text("name", { label: "Name" }), field.number("age"))
      );
      const result = generateUiSchemaFromIR(ir);

      expect(result.type).toBe("VerticalLayout");
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Negative cases
  // ---------------------------------------------------------------------------

  describe("negative cases", () => {
    it("should not include a rule property when the field is not in any conditional", () => {
      const ir = formIRFromElements([simpleFieldNode("foo"), simpleFieldNode("bar")]);
      const result = generateUiSchemaFromIR(ir);

      for (const el of result.elements) {
        expect(el.rule).toBeUndefined();
      }
    });

    it("should not propagate the rule to sibling fields outside the conditional", () => {
      const ir = formIRFromElements([
        simpleFieldNode("always"),
        conditionalNode("flag", "yes", [simpleFieldNode("conditional")]),
        simpleFieldNode("alsoAlways"),
      ]);
      const result = generateUiSchemaFromIR(ir);

      expect(result.elements).toHaveLength(3);

      // First and last fields have no rule
      expect(expectControl(result.elements, 0).rule).toBeUndefined();
      expect(expectControl(result.elements, 2).rule).toBeUndefined();

      // Middle field (from conditional) has the rule
      expect(expectControl(result.elements, 1).rule).toBeDefined();
    });
  });
});
