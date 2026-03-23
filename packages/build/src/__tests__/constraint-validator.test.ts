import { describe, it, expect } from "vitest";
import type {
  FormIR,
  FieldNode,
  Provenance,
  NumericConstraintNode,
  LengthConstraintNode,
  EnumMemberConstraintNode,
  PatternConstraintNode,
  ArrayCardinalityConstraintNode,
  CustomConstraintNode,
  PrimitiveTypeNode,
  ArrayTypeNode,
  EnumTypeNode,
  ObjectTypeNode,
} from "@formspec/core";
import { IR_VERSION } from "@formspec/core";
import { validateIR } from "../validate/index.js";
import type { ValidationDiagnostic, ExtensionRegistry } from "../validate/index.js";

// =============================================================================
// HELPERS
// =============================================================================

const FILE = "/project/src/form.ts";

/** Minimal provenance at a given line for test readability. */
function prov(line: number, tagName?: string): Provenance {
  if (tagName !== undefined) {
    return { surface: "chain-dsl", file: FILE, line, column: 0, tagName };
  }
  return { surface: "chain-dsl", file: FILE, line, column: 0 };
}

/** Primitive number type node. */
const NUMBER_TYPE: PrimitiveTypeNode = { kind: "primitive", primitiveKind: "number" };

/** Primitive string type node. */
const STRING_TYPE: PrimitiveTypeNode = { kind: "primitive", primitiveKind: "string" };

/** Primitive boolean type node. */
const BOOL_TYPE: PrimitiveTypeNode = { kind: "primitive", primitiveKind: "boolean" };

/** Simple array-of-strings type node. */
const ARRAY_TYPE: ArrayTypeNode = {
  kind: "array",
  items: { kind: "primitive", primitiveKind: "string" },
};

/** Simple enum type node. */
function enumType(values: readonly string[]): EnumTypeNode {
  return { kind: "enum", members: values.map((v) => ({ value: v })) };
}

/** Build a minimum constraint. */
function minConstraint(value: number, line = 1): NumericConstraintNode {
  return { kind: "constraint", constraintKind: "minimum", value, provenance: prov(line, "minimum") };
}

/** Build a maximum constraint. */
function maxConstraint(value: number, line = 2): NumericConstraintNode {
  return { kind: "constraint", constraintKind: "maximum", value, provenance: prov(line, "maximum") };
}

/** Build an exclusiveMinimum constraint. */
function exMinConstraint(value: number, line = 1): NumericConstraintNode {
  return {
    kind: "constraint",
    constraintKind: "exclusiveMinimum",
    value,
    provenance: prov(line, "exclusiveMinimum"),
  };
}

/** Build an exclusiveMaximum constraint. */
function exMaxConstraint(value: number, line = 2): NumericConstraintNode {
  return {
    kind: "constraint",
    constraintKind: "exclusiveMaximum",
    value,
    provenance: prov(line, "exclusiveMaximum"),
  };
}

/** Build a minLength constraint. */
function minLenConstraint(value: number, line = 1): LengthConstraintNode {
  return {
    kind: "constraint",
    constraintKind: "minLength",
    value,
    provenance: prov(line, "minLength"),
  };
}

/** Build a maxLength constraint. */
function maxLenConstraint(value: number, line = 2): LengthConstraintNode {
  return {
    kind: "constraint",
    constraintKind: "maxLength",
    value,
    provenance: prov(line, "maxLength"),
  };
}

/** Build a minItems constraint. */
function minItemsConstraint(value: number, line = 1): LengthConstraintNode {
  return {
    kind: "constraint",
    constraintKind: "minItems",
    value,
    provenance: prov(line, "minItems"),
  };
}

/** Build a maxItems constraint. */
function maxItemsConstraint(value: number, line = 2): LengthConstraintNode {
  return {
    kind: "constraint",
    constraintKind: "maxItems",
    value,
    provenance: prov(line, "maxItems"),
  };
}

/** Build an allowedMembers constraint. */
function allowedMembersConstraint(
  members: readonly (string | number)[],
  line = 1
): EnumMemberConstraintNode {
  return {
    kind: "constraint",
    constraintKind: "allowedMembers",
    members,
    provenance: prov(line, "allowedMembers"),
  };
}

/** Build a pattern constraint. */
function patternConstraint(pattern: string, line = 1): PatternConstraintNode {
  return {
    kind: "constraint",
    constraintKind: "pattern",
    pattern,
    provenance: prov(line, "pattern"),
  };
}

/** Build a uniqueItems constraint. */
function uniqueItemsConstraint(line = 1): ArrayCardinalityConstraintNode {
  return {
    kind: "constraint",
    constraintKind: "uniqueItems",
    value: true,
    provenance: prov(line, "uniqueItems"),
  };
}

/** Build a custom constraint. */
function customConstraint(
  constraintId: string,
  line = 1
): CustomConstraintNode {
  return {
    kind: "constraint",
    constraintKind: "custom",
    constraintId,
    payload: {},
    compositionRule: "intersect",
    provenance: prov(line, constraintId),
  };
}

/** Build a minimal FieldNode with given type and constraints. */
function makeField(
  name: string,
  type: FieldNode["type"],
  constraints: FieldNode["constraints"] = []
): FieldNode {
  return {
    kind: "field",
    name,
    type,
    required: false,
    constraints,
    annotations: [],
    provenance: prov(1),
  };
}

/** Build a minimal FormIR with the given top-level field nodes. */
function makeIR(fields: readonly FieldNode[]): FormIR {
  return {
    kind: "form-ir",
    irVersion: IR_VERSION,
    elements: fields,
    typeRegistry: {},
    provenance: prov(1),
  };
}

/** Extract diagnostics matching a code prefix (e.g. "FORMSPEC-CONTRADICTION"). */
function byCode(
  diagnostics: readonly ValidationDiagnostic[],
  prefix: string
): readonly ValidationDiagnostic[] {
  return diagnostics.filter((d) => d.code.startsWith(prefix));
}

// =============================================================================
// TESTS
// =============================================================================

describe("validateIR", () => {
  // ---------------------------------------------------------------------------
  // 1. Valid form — no diagnostics
  // ---------------------------------------------------------------------------

  describe("valid form", () => {
    it("returns no diagnostics for a form with no constraints", () => {
      const ir = makeIR([makeField("name", STRING_TYPE)]);
      const result = validateIR(ir);

      expect(result.diagnostics).toHaveLength(0);
      expect(result.valid).toBe(true);
    });

    it("returns no diagnostics for a form with valid min < max constraints", () => {
      const ir = makeIR([
        makeField("age", NUMBER_TYPE, [minConstraint(0), maxConstraint(120)]),
      ]);
      const result = validateIR(ir);

      expect(result.diagnostics).toHaveLength(0);
      expect(result.valid).toBe(true);
    });

    it("returns no diagnostics for equal min and max on a number field", () => {
      const ir = makeIR([
        makeField("exact", NUMBER_TYPE, [minConstraint(5), maxConstraint(5)]),
      ]);
      const result = validateIR(ir);

      expect(result.diagnostics).toHaveLength(0);
      expect(result.valid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. minimum > maximum → CONTRADICTION
  // ---------------------------------------------------------------------------

  describe("minimum > maximum", () => {
    it("emits CONTRADICTION-001 when minimum > maximum", () => {
      const ir = makeIR([
        makeField("count", NUMBER_TYPE, [minConstraint(10, 1), maxConstraint(5, 2)]),
      ]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      expect(result.diagnostics).toHaveLength(1);
      const diag = result.diagnostics[0];
      expect(diag?.code).toBe("FORMSPEC-CONTRADICTION-001");
      expect(diag?.message).toContain("minimum");
      expect(diag?.message).toContain("maximum");
      expect(diag?.message).toContain("count");
    });

    it("does not emit when minimum equals maximum", () => {
      const ir = makeIR([
        makeField("count", NUMBER_TYPE, [minConstraint(5, 1), maxConstraint(5, 2)]),
      ]);
      const result = validateIR(ir);

      expect(result.valid).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. exclusiveMinimum >= maximum → CONTRADICTION
  // ---------------------------------------------------------------------------

  describe("exclusiveMinimum >= maximum", () => {
    it("emits CONTRADICTION-001 when exclusiveMinimum === maximum", () => {
      const ir = makeIR([
        makeField("val", NUMBER_TYPE, [exMinConstraint(5, 1), maxConstraint(5, 2)]),
      ]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      const diag = result.diagnostics[0];
      expect(diag?.code).toBe("FORMSPEC-CONTRADICTION-001");
      expect(diag?.message).toContain("exclusiveMinimum");
    });

    it("emits CONTRADICTION-001 when exclusiveMinimum > maximum", () => {
      const ir = makeIR([
        makeField("val", NUMBER_TYPE, [exMinConstraint(10, 1), maxConstraint(5, 2)]),
      ]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
    });

    it("does not emit when exclusiveMinimum < maximum", () => {
      const ir = makeIR([
        makeField("val", NUMBER_TYPE, [exMinConstraint(4, 1), maxConstraint(5, 2)]),
      ]);
      expect(validateIR(ir).valid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. minimum >= exclusiveMaximum → CONTRADICTION
  // ---------------------------------------------------------------------------

  describe("minimum >= exclusiveMaximum", () => {
    it("emits CONTRADICTION-001 when minimum === exclusiveMaximum", () => {
      const ir = makeIR([
        makeField("val", NUMBER_TYPE, [minConstraint(5, 1), exMaxConstraint(5, 2)]),
      ]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      const diag = result.diagnostics[0];
      expect(diag?.code).toBe("FORMSPEC-CONTRADICTION-001");
      expect(diag?.message).toContain("exclusiveMaximum");
    });

    it("emits CONTRADICTION-001 when minimum > exclusiveMaximum", () => {
      const ir = makeIR([
        makeField("val", NUMBER_TYPE, [minConstraint(10, 1), exMaxConstraint(5, 2)]),
      ]);
      expect(validateIR(ir).valid).toBe(false);
    });

    it("does not emit when minimum < exclusiveMaximum", () => {
      const ir = makeIR([
        makeField("val", NUMBER_TYPE, [minConstraint(4, 1), exMaxConstraint(5, 2)]),
      ]);
      expect(validateIR(ir).valid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. exclusiveMinimum >= exclusiveMaximum → CONTRADICTION
  // ---------------------------------------------------------------------------

  describe("exclusiveMinimum >= exclusiveMaximum", () => {
    it("emits CONTRADICTION-001 when exclusiveMinimum === exclusiveMaximum", () => {
      const ir = makeIR([
        makeField("val", NUMBER_TYPE, [exMinConstraint(5, 1), exMaxConstraint(5, 2)]),
      ]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      const diag = result.diagnostics[0];
      expect(diag?.code).toBe("FORMSPEC-CONTRADICTION-001");
    });

    it("emits CONTRADICTION-001 when exclusiveMinimum > exclusiveMaximum", () => {
      const ir = makeIR([
        makeField("val", NUMBER_TYPE, [exMinConstraint(6, 1), exMaxConstraint(5, 2)]),
      ]);
      expect(validateIR(ir).valid).toBe(false);
    });

    it("does not emit when exclusiveMinimum < exclusiveMaximum", () => {
      const ir = makeIR([
        makeField("val", NUMBER_TYPE, [exMinConstraint(4, 1), exMaxConstraint(5, 2)]),
      ]);
      expect(validateIR(ir).valid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. minLength > maxLength → CONTRADICTION
  // ---------------------------------------------------------------------------

  describe("minLength > maxLength", () => {
    it("emits CONTRADICTION-001 when minLength > maxLength", () => {
      const ir = makeIR([
        makeField("code", STRING_TYPE, [minLenConstraint(10, 1), maxLenConstraint(5, 2)]),
      ]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      const diag = result.diagnostics[0];
      expect(diag?.code).toBe("FORMSPEC-CONTRADICTION-001");
      expect(diag?.message).toContain("minLength");
      expect(diag?.message).toContain("maxLength");
    });

    it("does not emit when minLength equals maxLength", () => {
      const ir = makeIR([
        makeField("code", STRING_TYPE, [minLenConstraint(5, 1), maxLenConstraint(5, 2)]),
      ]);
      expect(validateIR(ir).valid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. minItems > maxItems → CONTRADICTION
  // ---------------------------------------------------------------------------

  describe("minItems > maxItems", () => {
    it("emits CONTRADICTION-001 when minItems > maxItems", () => {
      const ir = makeIR([
        makeField("tags", ARRAY_TYPE, [minItemsConstraint(5, 1), maxItemsConstraint(2, 2)]),
      ]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      const diag = result.diagnostics[0];
      expect(diag?.code).toBe("FORMSPEC-CONTRADICTION-001");
      expect(diag?.message).toContain("minItems");
      expect(diag?.message).toContain("maxItems");
    });

    it("does not emit when minItems equals maxItems", () => {
      const ir = makeIR([
        makeField("tags", ARRAY_TYPE, [minItemsConstraint(3, 1), maxItemsConstraint(3, 2)]),
      ]);
      expect(validateIR(ir).valid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Empty allowedMembers intersection → CONTRADICTION
  // ---------------------------------------------------------------------------

  describe("allowedMembers empty intersection", () => {
    it("emits CONTRADICTION-001 when two allowedMembers sets are disjoint", () => {
      const ir = makeIR([
        makeField("status", enumType(["a", "b", "c"]), [
          allowedMembersConstraint(["a", "b"], 1),
          allowedMembersConstraint(["c"], 2),
        ]),
      ]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      const diag = result.diagnostics[0];
      expect(diag?.code).toBe("FORMSPEC-CONTRADICTION-001");
      expect(diag?.message).toContain("allowedMembers");
    });

    it("does not emit when two allowedMembers sets have a common member", () => {
      const ir = makeIR([
        makeField("status", enumType(["a", "b", "c"]), [
          allowedMembersConstraint(["a", "b"], 1),
          allowedMembersConstraint(["b", "c"], 2),
        ]),
      ]);
      expect(validateIR(ir).valid).toBe(true);
    });

    it("does not emit when there is only one allowedMembers constraint", () => {
      const ir = makeIR([
        makeField("status", enumType(["a", "b"]), [allowedMembersConstraint(["a"], 1)]),
      ]);
      expect(validateIR(ir).valid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Numeric constraints on non-number fields → TYPE_MISMATCH
  // ---------------------------------------------------------------------------

  describe("numeric constraints on non-number fields", () => {
    it("emits TYPE_MISMATCH-001 for minimum on a string field", () => {
      const ir = makeIR([makeField("name", STRING_TYPE, [minConstraint(5, 1)])]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      const diag = result.diagnostics[0];
      expect(diag?.code).toBe("FORMSPEC-TYPE_MISMATCH-001");
      expect(diag?.message).toContain("minimum");
      expect(diag?.message).toContain("number");
      expect(diag?.message).toContain("string");
    });

    it("emits TYPE_MISMATCH-001 for maximum on a string field", () => {
      const ir = makeIR([makeField("name", STRING_TYPE, [maxConstraint(10, 1)])]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      expect(result.diagnostics[0]?.code).toBe("FORMSPEC-TYPE_MISMATCH-001");
    });

    it("emits TYPE_MISMATCH-001 for exclusiveMinimum on a boolean field", () => {
      const ir = makeIR([makeField("flag", BOOL_TYPE, [exMinConstraint(0, 1)])]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      expect(result.diagnostics[0]?.code).toBe("FORMSPEC-TYPE_MISMATCH-001");
    });

    it("emits TYPE_MISMATCH-001 for multipleOf on a string field", () => {
      const multipleOf: NumericConstraintNode = {
        kind: "constraint",
        constraintKind: "multipleOf",
        value: 5,
        provenance: prov(1, "multipleOf"),
      };
      const ir = makeIR([makeField("name", STRING_TYPE, [multipleOf])]);
      expect(validateIR(ir).valid).toBe(false);
      expect(validateIR(ir).diagnostics[0]?.code).toBe("FORMSPEC-TYPE_MISMATCH-001");
    });
  });

  // ---------------------------------------------------------------------------
  // 10. String constraints on non-string fields → TYPE_MISMATCH
  // ---------------------------------------------------------------------------

  describe("string constraints on non-string fields", () => {
    it("emits TYPE_MISMATCH-001 for minLength on a number field", () => {
      const ir = makeIR([makeField("age", NUMBER_TYPE, [minLenConstraint(1, 1)])]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      const diag = result.diagnostics[0];
      expect(diag?.code).toBe("FORMSPEC-TYPE_MISMATCH-001");
      expect(diag?.message).toContain("minLength");
      expect(diag?.message).toContain("string");
    });

    it("emits TYPE_MISMATCH-001 for maxLength on a boolean field", () => {
      const ir = makeIR([makeField("flag", BOOL_TYPE, [maxLenConstraint(5, 1)])]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      expect(result.diagnostics[0]?.code).toBe("FORMSPEC-TYPE_MISMATCH-001");
    });

    it("emits TYPE_MISMATCH-001 for pattern on an array field", () => {
      const ir = makeIR([makeField("tags", ARRAY_TYPE, [patternConstraint("^[a-z]+$", 1)])]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      expect(result.diagnostics[0]?.code).toBe("FORMSPEC-TYPE_MISMATCH-001");
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Array constraints on non-array fields → TYPE_MISMATCH
  // ---------------------------------------------------------------------------

  describe("array constraints on non-array fields", () => {
    it("emits TYPE_MISMATCH-001 for minItems on a string field", () => {
      const ir = makeIR([makeField("name", STRING_TYPE, [minItemsConstraint(1, 1)])]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      const diag = result.diagnostics[0];
      expect(diag?.code).toBe("FORMSPEC-TYPE_MISMATCH-001");
      expect(diag?.message).toContain("minItems");
      expect(diag?.message).toContain("array");
    });

    it("emits TYPE_MISMATCH-001 for maxItems on a number field", () => {
      const ir = makeIR([makeField("count", NUMBER_TYPE, [maxItemsConstraint(5, 1)])]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      expect(result.diagnostics[0]?.code).toBe("FORMSPEC-TYPE_MISMATCH-001");
    });

    it("emits TYPE_MISMATCH-001 for uniqueItems on a string field", () => {
      const ir = makeIR([makeField("name", STRING_TYPE, [uniqueItemsConstraint(1)])]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      expect(result.diagnostics[0]?.code).toBe("FORMSPEC-TYPE_MISMATCH-001");
    });

    it("does not emit for uniqueItems on an array field", () => {
      const ir = makeIR([makeField("tags", ARRAY_TYPE, [uniqueItemsConstraint(1)])]);
      expect(validateIR(ir).valid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 12. Multiple patterns → NO contradiction (undecidable)
  // ---------------------------------------------------------------------------

  describe("multiple pattern constraints", () => {
    it("does not emit a contradiction for two pattern constraints (undecidable)", () => {
      const ir = makeIR([
        makeField("code", STRING_TYPE, [
          patternConstraint("^[a-z]+$", 1),
          patternConstraint("^[0-9]+$", 2),
        ]),
      ]);
      const result = validateIR(ir);

      // Type-check passes (both patterns are on a string field), no contradiction
      const contradictions = byCode(result.diagnostics, "FORMSPEC-CONTRADICTION");
      expect(contradictions).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 13. Valid constraints → no diagnostics
  // ---------------------------------------------------------------------------

  describe("valid constraint combinations", () => {
    it("accepts valid numeric bounds", () => {
      const ir = makeIR([
        makeField("score", NUMBER_TYPE, [minConstraint(0), maxConstraint(100)]),
      ]);
      expect(validateIR(ir).valid).toBe(true);
    });

    it("accepts valid string length constraints", () => {
      const ir = makeIR([
        makeField("label", STRING_TYPE, [minLenConstraint(1), maxLenConstraint(50)]),
      ]);
      expect(validateIR(ir).valid).toBe(true);
    });

    it("accepts valid array cardinality constraints", () => {
      const ir = makeIR([
        makeField("tags", ARRAY_TYPE, [minItemsConstraint(0), maxItemsConstraint(10)]),
      ]);
      expect(validateIR(ir).valid).toBe(true);
    });

    it("accepts valid allowedMembers with non-empty intersection", () => {
      const ir = makeIR([
        makeField("role", enumType(["admin", "user", "guest"]), [
          allowedMembersConstraint(["admin", "user"]),
          allowedMembersConstraint(["user", "guest"]),
        ]),
      ]);
      expect(validateIR(ir).valid).toBe(true);
    });

    it("accepts a pattern constraint on a string field", () => {
      const ir = makeIR([
        makeField("slug", STRING_TYPE, [patternConstraint("^[a-z0-9-]+$")]),
      ]);
      expect(validateIR(ir).valid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 14. Nested object field constraint issues are detected
  // ---------------------------------------------------------------------------

  describe("nested object field constraint detection", () => {
    it("detects contradictions in nested object properties", () => {
      const objectType: ObjectTypeNode = {
        kind: "object",
        additionalProperties: false,
        properties: [
          {
            name: "score",
            type: NUMBER_TYPE,
            optional: false,
            constraints: [minConstraint(100, 10), maxConstraint(50, 11)],
            annotations: [],
            provenance: prov(10),
          },
        ],
      };

      const ir = makeIR([makeField("details", objectType)]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      const diag = result.diagnostics[0];
      expect(diag?.code).toBe("FORMSPEC-CONTRADICTION-001");
      // Qualified name should appear in the message
      expect(diag?.message).toContain("details.score");
    });

    it("detects type mismatches in nested object properties", () => {
      const objectType: ObjectTypeNode = {
        kind: "object",
        additionalProperties: false,
        properties: [
          {
            name: "label",
            type: STRING_TYPE,
            optional: false,
            constraints: [minConstraint(0, 10)], // numeric constraint on string
            annotations: [],
            provenance: prov(10),
          },
        ],
      };

      const ir = makeIR([makeField("address", objectType)]);
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      expect(result.diagnostics[0]?.code).toBe("FORMSPEC-TYPE_MISMATCH-001");
      expect(result.diagnostics[0]?.message).toContain("address.label");
    });
  });

  // ---------------------------------------------------------------------------
  // 15. Diagnostic has correct provenance for both sides of contradiction
  // ---------------------------------------------------------------------------

  describe("diagnostic provenance", () => {
    it("primaryLocation points to the first constraint, relatedLocations to the second", () => {
      const minProv = prov(5, "minimum");
      const maxProv = prov(10, "maximum");
      const minC: NumericConstraintNode = {
        kind: "constraint",
        constraintKind: "minimum",
        value: 50,
        provenance: minProv,
      };
      const maxC: NumericConstraintNode = {
        kind: "constraint",
        constraintKind: "maximum",
        value: 10,
        provenance: maxProv,
      };

      const ir = makeIR([makeField("qty", NUMBER_TYPE, [minC, maxC])]);
      const result = validateIR(ir);

      expect(result.diagnostics).toHaveLength(1);
      const diag = result.diagnostics[0];
      expect(diag?.primaryLocation).toEqual(minProv);
      expect(diag?.relatedLocations).toHaveLength(1);
      expect(diag?.relatedLocations[0]).toEqual(maxProv);
    });

    it("TYPE_MISMATCH diagnostics have the constraint provenance as primaryLocation and no relatedLocations", () => {
      const constraintProv = prov(7, "minimum");
      const constraint: NumericConstraintNode = {
        kind: "constraint",
        constraintKind: "minimum",
        value: 0,
        provenance: constraintProv,
      };

      const ir = makeIR([makeField("name", STRING_TYPE, [constraint])]);
      const result = validateIR(ir);

      expect(result.diagnostics).toHaveLength(1);
      const diag = result.diagnostics[0];
      expect(diag?.primaryLocation).toEqual(constraintProv);
      expect(diag?.relatedLocations).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 16. Custom vendor prefix
  // ---------------------------------------------------------------------------

  describe("custom vendor prefix", () => {
    it("uses the provided vendorPrefix in diagnostic codes", () => {
      const ir = makeIR([
        makeField("count", NUMBER_TYPE, [minConstraint(10, 1), maxConstraint(5, 2)]),
      ]);
      const result = validateIR(ir, { vendorPrefix: "ACME" });

      expect(result.diagnostics[0]?.code).toBe("ACME-CONTRADICTION-001");
    });

    it("uses FORMSPEC as the default prefix when none is provided", () => {
      const ir = makeIR([
        makeField("count", NUMBER_TYPE, [minConstraint(10, 1), maxConstraint(5, 2)]),
      ]);
      const result = validateIR(ir);

      expect(result.diagnostics[0]?.code).toMatch(/^FORMSPEC-/);
    });
  });

  // ---------------------------------------------------------------------------
  // 17. Group and conditional layouts are walked
  // ---------------------------------------------------------------------------

  describe("group and conditional layouts are walked", () => {
    it("detects contradictions inside a group layout node", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          {
            kind: "group",
            label: "Prices",
            elements: [
              makeField("price", NUMBER_TYPE, [minConstraint(100, 1), maxConstraint(10, 2)]),
            ],
            provenance: prov(1),
          },
        ],
        typeRegistry: {},
        provenance: prov(1),
      };
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      expect(result.diagnostics[0]?.code).toBe("FORMSPEC-CONTRADICTION-001");
    });

    it("detects contradictions inside a conditional layout node", () => {
      const ir: FormIR = {
        kind: "form-ir",
        irVersion: IR_VERSION,
        elements: [
          {
            kind: "conditional",
            fieldName: "hasDiscount",
            value: true,
            elements: [
              makeField("discount", NUMBER_TYPE, [minConstraint(50, 1), maxConstraint(10, 2)]),
            ],
            provenance: prov(1),
          },
        ],
        typeRegistry: {},
        provenance: prov(1),
      };
      const result = validateIR(ir);

      expect(result.valid).toBe(false);
      expect(result.diagnostics[0]?.code).toBe("FORMSPEC-CONTRADICTION-001");
    });
  });

  // ---------------------------------------------------------------------------
  // 18. valid property semantics
  // ---------------------------------------------------------------------------

  describe("valid property", () => {
    it("is false when there are error diagnostics", () => {
      const ir = makeIR([
        makeField("count", NUMBER_TYPE, [minConstraint(10), maxConstraint(5)]),
      ]);
      expect(validateIR(ir).valid).toBe(false);
    });

    it("is true when there are no diagnostics", () => {
      const ir = makeIR([makeField("name", STRING_TYPE)]);
      expect(validateIR(ir).valid).toBe(true);
    });

    it("is true when there are only warning diagnostics (valid despite warnings)", () => {
      const registry: ExtensionRegistry = new Set(["x-known/ext/constraint"]);
      const ir = makeIR([
        makeField("field", STRING_TYPE, [
          customConstraint("x-unknown/ext/constraint", 1),
        ]),
      ]);
      const result = validateIR(ir, { extensionRegistry: registry });

      // Warning emitted but valid is still true
      expect(result.valid).toBe(true);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.severity).toBe("warning");
    });
  });

  // ---------------------------------------------------------------------------
  // 19. DEC-006: Unknown extension warning
  // ---------------------------------------------------------------------------

  describe("DEC-006: unknown extension constraint", () => {
    it("emits UNKNOWN_EXTENSION warning when constraintId not in registry", () => {
      const registry: ExtensionRegistry = new Set(["x-stripe/monetary/currency"]);
      const ir = makeIR([
        makeField("price", STRING_TYPE, [customConstraint("x-stripe/monetary/unknown-thing", 1)]),
      ]);
      const result = validateIR(ir, { extensionRegistry: registry });

      expect(result.valid).toBe(true); // warning, not error
      expect(result.diagnostics).toHaveLength(1);
      const diag = result.diagnostics[0];
      expect(diag?.code).toBe("FORMSPEC-UNKNOWN_EXTENSION-001");
      expect(diag?.severity).toBe("warning");
      expect(diag?.message).toContain("x-stripe/monetary/unknown-thing");
    });

    it("does not emit when constraintId is found in registry", () => {
      const registry: ExtensionRegistry = new Set(["x-stripe/monetary/currency"]);
      const ir = makeIR([
        makeField("price", STRING_TYPE, [customConstraint("x-stripe/monetary/currency", 1)]),
      ]);
      const result = validateIR(ir, { extensionRegistry: registry });

      expect(result.valid).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });

    it("does not emit when no extensionRegistry is provided", () => {
      const ir = makeIR([
        makeField("price", STRING_TYPE, [customConstraint("x-anything/ext/constraint", 1)]),
      ]);
      const result = validateIR(ir); // no extensionRegistry option

      expect(result.valid).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });

    it("uses custom vendor prefix in UNKNOWN_EXTENSION code", () => {
      const registry: ExtensionRegistry = new Set();
      const ir = makeIR([
        makeField("price", STRING_TYPE, [customConstraint("x-anything/ext/constraint", 1)]),
      ]);
      const result = validateIR(ir, { vendorPrefix: "MYCO", extensionRegistry: registry });

      expect(result.diagnostics[0]?.code).toBe("MYCO-UNKNOWN_EXTENSION-001");
    });

    it("emits warning for each unknown custom constraint on different fields", () => {
      const registry: ExtensionRegistry = new Set();
      const ir = makeIR([
        makeField("field1", STRING_TYPE, [customConstraint("x-ext/a", 1)]),
        makeField("field2", STRING_TYPE, [customConstraint("x-ext/b", 2)]),
      ]);
      const result = validateIR(ir, { extensionRegistry: registry });

      expect(result.valid).toBe(true);
      expect(result.diagnostics).toHaveLength(2);
      expect(result.diagnostics.every((d) => d.severity === "warning")).toBe(true);
    });
  });
});
