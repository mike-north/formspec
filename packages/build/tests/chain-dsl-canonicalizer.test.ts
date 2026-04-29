import { describe, expect, it } from "vitest";
import { field, formspec, group, is, when } from "@formspec/dsl";
import { IR_VERSION } from "@formspec/core/internals";
import type {
  ArrayTypeNode,
  ConditionalLayoutNode,
  DynamicTypeNode,
  EnumTypeNode,
  FieldNode,
  FormIR,
  GroupLayoutNode,
  ObjectTypeNode,
  PrimitiveTypeNode,
} from "@formspec/core/internals";
import { canonicalizeChainDSL } from "../src/canonicalize/index.js";

// =============================================================================
// HELPERS
// =============================================================================

const CHAIN_DSL_PROVENANCE = {
  surface: "chain-dsl",
  file: "",
  line: 0,
  column: 0,
} as const;

function getField(ir: FormIR, name: string): FieldNode {
  const el = ir.elements.find((e) => e.kind === "field" && e.name === name);
  if (el?.kind !== "field") {
    throw new Error(`Field "${name}" not found in IR`);
  }
  return el;
}

function getGroup(ir: FormIR, label: string): GroupLayoutNode {
  const el = ir.elements.find((e) => e.kind === "group" && e.label === label);
  if (el?.kind !== "group") {
    throw new Error(`Group "${label}" not found in IR`);
  }
  return el;
}

function getConditional(ir: FormIR, fieldName: string): ConditionalLayoutNode {
  const el = ir.elements.find((e) => e.kind === "conditional" && e.fieldName === fieldName);
  if (el?.kind !== "conditional") {
    throw new Error(`Conditional on field "${fieldName}" not found in IR`);
  }
  return el;
}

// =============================================================================
// TOP-LEVEL STRUCTURE
// =============================================================================

describe("canonicalizeChainDSL", () => {
  describe("FormIR top-level structure", () => {
    it("produces a form-ir with correct kind and version", () => {
      const form = formspec(field.text("name"));
      const ir = canonicalizeChainDSL(form);

      expect(ir.kind).toBe("form-ir");
      expect(ir.irVersion).toBe(IR_VERSION);
      expect(ir.typeRegistry).toEqual({});
      expect(ir.provenance).toEqual(CHAIN_DSL_PROVENANCE);
    });

    it("produces empty elements array for empty form", () => {
      const form = formspec();
      const ir = canonicalizeChainDSL(form);

      expect(ir.elements).toHaveLength(0);
    });

    it("preserves element order", () => {
      const form = formspec(field.text("a"), field.text("b"), field.text("c"));
      const ir = canonicalizeChainDSL(form);

      expect(ir.elements.map((e) => (e.kind === "field" ? e.name : null))).toEqual(["a", "b", "c"]);
    });
  });

  // =============================================================================
  // FIELD: TEXT
  // =============================================================================

  describe("text field", () => {
    it("produces FieldNode with PrimitiveTypeNode(string)", () => {
      const form = formspec(field.text("email"));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "email");

      expect(f.kind).toBe("field");
      expect(f.name).toBe("email");
      const type = f.type as PrimitiveTypeNode;
      expect(type.kind).toBe("primitive");
      expect(type.primitiveKind).toBe("string");
    });

    it("maps label to DisplayNameAnnotationNode", () => {
      const form = formspec(field.text("email", { label: "Email Address" }));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "email");

      expect(f.annotations).toHaveLength(1);
      expect(f.annotations[0]).toMatchObject({
        kind: "annotation",
        annotationKind: "displayName",
        value: "Email Address",
        provenance: CHAIN_DSL_PROVENANCE,
      });
    });

    it("maps placeholder to PlaceholderAnnotationNode", () => {
      const form = formspec(field.text("email", { placeholder: "e.g. user@example.com" }));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "email");

      expect(f.annotations).toHaveLength(1);
      expect(f.annotations[0]).toMatchObject({
        kind: "annotation",
        annotationKind: "placeholder",
        value: "e.g. user@example.com",
      });
    });

    it("maps both label and placeholder to two annotations in order", () => {
      const form = formspec(
        field.text("email", { label: "Email", placeholder: "user@example.com" })
      );
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "email");

      expect(f.annotations).toHaveLength(2);
      expect(f.annotations[0]).toMatchObject({ annotationKind: "displayName", value: "Email" });
      expect(f.annotations[1]).toMatchObject({
        annotationKind: "placeholder",
        value: "user@example.com",
      });
    });

    it("produces no annotations when neither label nor placeholder is set", () => {
      const form = formspec(field.text("name"));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "name");

      expect(f.annotations).toHaveLength(0);
    });

    it("sets required=true when required option is true", () => {
      const form = formspec(field.text("name", { required: true }));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "name");

      expect(f.required).toBe(true);
    });

    it("sets required=false when required option is absent", () => {
      const form = formspec(field.text("name"));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "name");

      expect(f.required).toBe(false);
    });

    it("sets required=false when required option is false", () => {
      const form = formspec(field.text("name", { required: false }));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "name");

      expect(f.required).toBe(false);
    });

    it("produces no constraints for text field", () => {
      const form = formspec(field.text("name"));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "name");

      expect(f.constraints).toHaveLength(0);
    });
  });

  // =============================================================================
  // FIELD: NUMBER
  // =============================================================================

  describe("number field", () => {
    it("produces FieldNode with PrimitiveTypeNode(number)", () => {
      const form = formspec(field.number("age"));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "age");

      const type = f.type as PrimitiveTypeNode;
      expect(type.kind).toBe("primitive");
      expect(type.primitiveKind).toBe("number");
    });

    it("maps min to NumericConstraintNode(minimum)", () => {
      const form = formspec(field.number("age", { min: 0 }));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "age");

      expect(f.constraints).toHaveLength(1);
      expect(f.constraints[0]).toMatchObject({
        kind: "constraint",
        constraintKind: "minimum",
        value: 0,
        provenance: CHAIN_DSL_PROVENANCE,
      });
    });

    it("maps max to NumericConstraintNode(maximum)", () => {
      const form = formspec(field.number("age", { max: 150 }));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "age");

      expect(f.constraints).toHaveLength(1);
      expect(f.constraints[0]).toMatchObject({
        kind: "constraint",
        constraintKind: "maximum",
        value: 150,
      });
    });

    it("maps both min and max to two constraint nodes in order", () => {
      const form = formspec(field.number("age", { min: 0, max: 150 }));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "age");

      expect(f.constraints).toHaveLength(2);
      expect(f.constraints[0]).toMatchObject({ constraintKind: "minimum", value: 0 });
      expect(f.constraints[1]).toMatchObject({ constraintKind: "maximum", value: 150 });
    });

    it("produces no constraints when min and max are absent", () => {
      const form = formspec(field.number("score"));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "score");

      expect(f.constraints).toHaveLength(0);
    });

    it("handles negative min and max values", () => {
      const form = formspec(field.number("temp", { min: -273.15, max: -0.01 }));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "temp");

      expect(f.constraints[0]).toMatchObject({ constraintKind: "minimum", value: -273.15 });
      expect(f.constraints[1]).toMatchObject({ constraintKind: "maximum", value: -0.01 });
    });
  });

  // =============================================================================
  // FIELD: BOOLEAN
  // =============================================================================

  describe("boolean field", () => {
    it("produces FieldNode with PrimitiveTypeNode(boolean)", () => {
      const form = formspec(field.boolean("active"));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "active");

      const type = f.type as PrimitiveTypeNode;
      expect(type.kind).toBe("primitive");
      expect(type.primitiveKind).toBe("boolean");
    });

    it("maps label to DisplayNameAnnotationNode", () => {
      const form = formspec(field.boolean("active", { label: "Is Active" }));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "active");

      expect(f.annotations).toHaveLength(1);
      expect(f.annotations[0]).toMatchObject({ annotationKind: "displayName", value: "Is Active" });
    });
  });

  // =============================================================================
  // FIELD: STATIC ENUM
  // =============================================================================

  describe("static enum field", () => {
    it("produces FieldNode with EnumTypeNode (string values)", () => {
      const form = formspec(field.enum("status", ["draft", "sent", "paid"] as const));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "status");

      const type = f.type as EnumTypeNode;
      expect(type.kind).toBe("enum");
      expect(type.members).toHaveLength(3);
      expect(type.members).toEqual([{ value: "draft" }, { value: "sent" }, { value: "paid" }]);
    });

    it("maps object options to EnumMember with label", () => {
      const form = formspec(
        field.enum("priority", [
          { id: "low", label: "Low Priority" },
          { id: "high", label: "High Priority" },
        ] as const)
      );
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "priority");

      const type = f.type as EnumTypeNode;
      expect(type.members).toEqual([
        { value: "low", label: "Low Priority" },
        { value: "high", label: "High Priority" },
      ]);
    });

    it("produces no constraints for enum field", () => {
      const form = formspec(field.enum("status", ["a", "b"] as const));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "status");

      expect(f.constraints).toHaveLength(0);
    });
  });

  // =============================================================================
  // FIELD: DYNAMIC ENUM
  // =============================================================================

  describe("dynamic enum field", () => {
    it("produces FieldNode with DynamicTypeNode(enum)", () => {
      const form = formspec(field.dynamicEnum("country", "fetch_countries"));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "country");

      const type = f.type as DynamicTypeNode;
      expect(type.kind).toBe("dynamic");
      expect(type.dynamicKind).toBe("enum");
      expect(type.sourceKey).toBe("fetch_countries");
      expect(type.parameterFields).toEqual([]);
    });

    it("maps params to parameterFields", () => {
      const form = formspec(
        field.dynamicEnum("city", "fetch_cities", { params: ["country", "region"] })
      );
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "city");

      const type = f.type as DynamicTypeNode;
      expect(type.parameterFields).toEqual(["country", "region"]);
    });

    it("has empty parameterFields when params is absent", () => {
      const form = formspec(field.dynamicEnum("country", "fetch_countries"));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "country");

      const type = f.type as DynamicTypeNode;
      expect(type.parameterFields).toEqual([]);
    });
  });

  // =============================================================================
  // FIELD: DYNAMIC SCHEMA
  // =============================================================================

  describe("dynamic schema field", () => {
    it("produces FieldNode with DynamicTypeNode(schema)", () => {
      const form = formspec(field.dynamicSchema("extension_data", "stripe_extension"));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "extension_data");

      const type = f.type as DynamicTypeNode;
      expect(type.kind).toBe("dynamic");
      expect(type.dynamicKind).toBe("schema");
      expect(type.sourceKey).toBe("stripe_extension");
      expect(type.parameterFields).toEqual([]);
    });
  });

  // =============================================================================
  // FIELD: ARRAY
  // =============================================================================

  describe("array field", () => {
    it("produces FieldNode with ArrayTypeNode containing ObjectTypeNode for items", () => {
      const form = formspec(
        field.array("lineItems", field.text("description"), field.number("qty"))
      );
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "lineItems");

      const type = f.type as ArrayTypeNode;
      expect(type.kind).toBe("array");
      expect(type.items.kind).toBe("object");
      const items = type.items as ObjectTypeNode;
      expect(items.properties).toHaveLength(2);
      expect(items.properties[0]).toMatchObject({ name: "description" });
      expect(items.properties[1]).toMatchObject({ name: "qty" });
    });

    it("maps minItems via arrayWithConfig to LengthConstraintNode(minItems)", () => {
      const form = formspec(field.arrayWithConfig("items", { minItems: 1 }, field.text("name")));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "items");

      expect(f.constraints).toHaveLength(1);
      expect(f.constraints[0]).toMatchObject({
        kind: "constraint",
        constraintKind: "minItems",
        value: 1,
      });
    });

    it("maps maxItems via arrayWithConfig to LengthConstraintNode(maxItems)", () => {
      const form = formspec(field.arrayWithConfig("items", { maxItems: 10 }, field.text("name")));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "items");

      expect(f.constraints).toHaveLength(1);
      expect(f.constraints[0]).toMatchObject({
        kind: "constraint",
        constraintKind: "maxItems",
        value: 10,
      });
    });

    it("maps both minItems and maxItems to two constraint nodes in order", () => {
      const form = formspec(
        field.arrayWithConfig("items", { minItems: 1, maxItems: 10 }, field.text("name"))
      );
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "items");

      expect(f.constraints).toHaveLength(2);
      expect(f.constraints[0]).toMatchObject({ constraintKind: "minItems", value: 1 });
      expect(f.constraints[1]).toMatchObject({ constraintKind: "maxItems", value: 10 });
    });

    it("produces no constraints for array field without min/maxItems", () => {
      const form = formspec(field.array("items", field.text("name")));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "items");

      expect(f.constraints).toHaveLength(0);
    });

    it("omits additionalProperties when array items are policy-defaulted objects", () => {
      const form = formspec(field.array("items", field.text("name")));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "items");

      const type = f.type as ArrayTypeNode;
      const items = type.items as ObjectTypeNode;
      expect(items.additionalProperties).toBeUndefined();
    });

    it("item properties have correct optional flag based on required", () => {
      const form = formspec(
        field.array(
          "items",
          field.text("required_field", { required: true }),
          field.text("optional_field")
        )
      );
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "items");

      const type = f.type as ArrayTypeNode;
      const items = type.items as ObjectTypeNode;
      expect(items.properties[0]).toMatchObject({ name: "required_field", optional: false });
      expect(items.properties[1]).toMatchObject({ name: "optional_field", optional: true });
    });
  });

  // =============================================================================
  // FIELD: OBJECT
  // =============================================================================

  describe("object field", () => {
    it("produces FieldNode with ObjectTypeNode", () => {
      const form = formspec(field.object("address", field.text("street"), field.text("city")));
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "address");

      const type = f.type as ObjectTypeNode;
      expect(type.kind).toBe("object");
      expect(type.additionalProperties).toBeUndefined();
      expect(type.properties).toHaveLength(2);
      expect(type.properties[0]).toMatchObject({ name: "street" });
      expect(type.properties[1]).toMatchObject({ name: "city" });
    });

    it("propagates constraints and annotations from nested fields to ObjectProperty", () => {
      const form = formspec(
        field.object("nested", field.number("score", { min: 0, max: 100, label: "Score" }))
      );
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "nested");

      const type = f.type as ObjectTypeNode;
      const prop = type.properties[0];
      expect(prop).toBeDefined();
      expect(prop?.name).toBe("score");
      expect(prop?.constraints).toHaveLength(2);
      expect(prop?.annotations).toHaveLength(1);
      expect(prop?.annotations[0]).toMatchObject({
        annotationKind: "displayName",
        value: "Score",
      });
    });
  });

  // =============================================================================
  // LAYOUT: GROUP
  // =============================================================================

  describe("group element", () => {
    it("produces GroupLayoutNode", () => {
      const form = formspec(group("Personal Info", field.text("name"), field.text("email")));
      const ir = canonicalizeChainDSL(form);
      const g = getGroup(ir, "Personal Info");

      expect(g.kind).toBe("group");
      expect(g.label).toBe("Personal Info");
      expect(g.elements).toHaveLength(2);
      expect(g.provenance).toEqual(CHAIN_DSL_PROVENANCE);
    });

    it("recursively canonicalizes group elements", () => {
      const form = formspec(group("Section", field.text("name")));
      const ir = canonicalizeChainDSL(form);
      const g = getGroup(ir, "Section");

      expect(g.elements[0]).toMatchObject({ kind: "field", name: "name" });
    });

    it("flattens group elements into ObjectProperty when group is inside object field", () => {
      const form = formspec(
        field.object("address", group("Fields", field.text("street"), field.text("city")))
      );
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "address");

      const type = f.type as ObjectTypeNode;
      expect(type.properties).toHaveLength(2);
      expect(type.properties[0]).toMatchObject({ name: "street" });
      expect(type.properties[1]).toMatchObject({ name: "city" });
    });
  });

  // =============================================================================
  // LAYOUT: CONDITIONAL
  // =============================================================================

  describe("conditional element", () => {
    it("produces ConditionalLayoutNode", () => {
      const form = formspec(
        field.enum("status", ["draft", "sent"] as const),
        when(is("status", "draft"), field.text("notes"))
      );
      const ir = canonicalizeChainDSL(form);
      const c = getConditional(ir, "status");

      expect(c.kind).toBe("conditional");
      expect(c.fieldName).toBe("status");
      expect(c.value).toBe("draft");
      expect(c.elements).toHaveLength(1);
      expect(c.provenance).toEqual(CHAIN_DSL_PROVENANCE);
    });

    it("recursively canonicalizes conditional elements", () => {
      const form = formspec(
        field.boolean("showExtra"),
        when(is("showExtra", true), field.text("extra"))
      );
      const ir = canonicalizeChainDSL(form);
      const c = getConditional(ir, "showExtra");

      expect(c.value).toBe(true);
      expect(c.elements[0]).toMatchObject({ kind: "field", name: "extra" });
    });

    it("flattens conditional elements into ObjectProperty when conditional is inside object field", () => {
      const form = formspec(
        field.object("nested", field.boolean("flag"), when(is("flag", true), field.text("extra")))
      );
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "nested");

      const type = f.type as ObjectTypeNode;
      // flag + extra flattened from the conditional
      expect(type.properties.map((p) => p.name)).toContain("extra");
    });

    it("marks conditional fields inside objects as optional regardless of required flag", () => {
      const form = formspec(
        field.object(
          "nested",
          field.text("always_present", { required: true }),
          when(is("always_present", "yes"), field.text("conditional_field", { required: true }))
        )
      );
      const ir = canonicalizeChainDSL(form);
      const f = getField(ir, "nested");

      const type = f.type as ObjectTypeNode;
      const alwaysPresent = type.properties.find((p) => p.name === "always_present");
      const conditionalField = type.properties.find((p) => p.name === "conditional_field");

      // Non-conditional required field → optional: false
      expect(alwaysPresent?.optional).toBe(false);
      // Conditional field → optional: true even though required: true was set
      expect(conditionalField?.optional).toBe(true);
    });
  });

  // =============================================================================
  // PROVENANCE
  // =============================================================================

  describe("provenance", () => {
    it("all nodes carry chain-dsl provenance", () => {
      const form = formspec(field.text("name"), group("G", field.number("score", { min: 0 })));
      const ir = canonicalizeChainDSL(form);

      expect(ir.provenance.surface).toBe("chain-dsl");

      const f = getField(ir, "name");
      expect(f.provenance.surface).toBe("chain-dsl");

      const g = getGroup(ir, "G");
      expect(g.provenance.surface).toBe("chain-dsl");

      const nestedField = g.elements[0] as FieldNode;
      expect(nestedField.provenance.surface).toBe("chain-dsl");
      expect(nestedField.constraints[0]).toMatchObject({ provenance: CHAIN_DSL_PROVENANCE });
    });
  });

  // =============================================================================
  // COMPLEX / INTEGRATION
  // =============================================================================

  describe("complex form", () => {
    it("correctly canonicalizes a form with all element types", () => {
      const form = formspec(
        field.text("firstName", { label: "First Name", required: true }),
        field.number("age", { min: 0, max: 150 }),
        field.boolean("active"),
        field.enum("status", ["draft", "sent"] as const),
        field.dynamicEnum("country", "fetch_countries"),
        group("Address", field.text("street"), field.text("city")),
        when(is("status", "draft"), field.text("notes"))
      );

      const ir = canonicalizeChainDSL(form);

      expect(ir.kind).toBe("form-ir");
      expect(ir.irVersion).toBe(IR_VERSION);
      expect(ir.elements).toHaveLength(7);

      // Check first name field
      const firstNameField = getField(ir, "firstName");
      expect(firstNameField.required).toBe(true);
      expect(firstNameField.annotations[0]).toMatchObject({
        annotationKind: "displayName",
        value: "First Name",
      });

      // Check age field
      const ageField = getField(ir, "age");
      expect(ageField.constraints).toHaveLength(2);

      // Check group
      const addrGroup = getGroup(ir, "Address");
      expect(addrGroup.elements).toHaveLength(2);

      // Check conditional
      const cond = getConditional(ir, "status");
      expect(cond.value).toBe("draft");
    });
  });
});
