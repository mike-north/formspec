import type {
  ConstraintNode,
  JsonValue,
  ObjectTypeNode,
  Provenance,
  ReferenceTypeNode,
  TypeNode,
} from "@formspec/core";
import { describe, expect, it } from "vitest";
import {
  analyzeConstraintTargets,
  dereferenceAnalysisType,
  type AnalysisTypeRegistry,
} from "../index.js";

const NUMBER_TYPE: TypeNode = { kind: "primitive", primitiveKind: "number" };

function provenance(line: number, tagName?: string): Provenance {
  return {
    surface: "tsdoc",
    file: "/virtual/formspec.ts",
    line,
    column: 0,
    ...(tagName === undefined ? {} : { tagName: `@${tagName}` }),
  };
}

function minimum(value: number, line: number): ConstraintNode {
  return {
    kind: "constraint",
    constraintKind: "minimum",
    value,
    provenance: provenance(line, "minimum"),
  };
}

function maximum(value: number, line: number): ConstraintNode {
  return {
    kind: "constraint",
    constraintKind: "maximum",
    value,
    provenance: provenance(line, "maximum"),
  };
}

function constValue(value: JsonValue, line: number): ConstraintNode {
  return {
    kind: "constraint",
    constraintKind: "const",
    value,
    provenance: provenance(line, "const"),
  };
}

describe("semantic-targets", () => {
  it("detects inherited contradictions on resolved path targets", () => {
    const result = analyzeConstraintTargets(
      "discount",
      { kind: "reference", name: "Discount", typeArguments: [] },
      [
        {
          ...minimum(120, 8),
          path: { segments: ["percent"] },
        },
      ],
      {
        Percent: {
          name: "Percent",
          type: NUMBER_TYPE,
          constraints: [maximum(100, 1)],
          provenance: provenance(1, "maximum"),
        },
        Discount: {
          name: "Discount",
          type: {
            kind: "object",
            properties: [
              {
                name: "percent",
                type: { kind: "reference", name: "Percent", typeArguments: [] },
                optional: false,
                constraints: [],
                annotations: [],
                provenance: provenance(4),
              },
            ],
            additionalProperties: false,
          },
          provenance: provenance(3),
        },
      }
    );

    const contradiction = result.diagnostics.find(
      (diagnostic) => diagnostic.code === "CONTRADICTING_CONSTRAINTS"
    );

    expect(contradiction?.message).toContain('Field "discount.percent"');
    expect(contradiction?.primaryLocation).toEqual(provenance(8, "minimum"));
    expect(contradiction?.relatedLocations).toEqual([provenance(1, "maximum")]);
    expect(result.targetStates).toContainEqual(
      expect.objectContaining({
        kind: "resolved",
        targetName: "discount.percent",
      })
    );
  });

  it("does not treat object const payloads with different key order as contradictory", () => {
    const objectType: ObjectTypeNode = {
      kind: "object",
      properties: [],
      additionalProperties: false,
    };

    const result = analyzeConstraintTargets(
      "settings",
      objectType,
      [constValue({ alpha: 1, beta: 2 }, 1), constValue({ beta: 2, alpha: 1 }, 2)],
      {}
    );

    expect(
      result.diagnostics.filter((diagnostic) => diagnostic.code === "CONTRADICTING_CONSTRAINTS")
    ).toHaveLength(0);
  });

  it("stops dereferencing circular references", () => {
    const registry: AnalysisTypeRegistry = {
      A: {
        name: "A",
        type: { kind: "reference", name: "B", typeArguments: [] },
        provenance: provenance(1),
      },
      B: {
        name: "B",
        type: { kind: "reference", name: "A", typeArguments: [] },
        provenance: provenance(2),
      },
    };
    const type: ReferenceTypeNode = { kind: "reference", name: "A", typeArguments: [] };

    expect(dereferenceAnalysisType(type, registry)).toEqual(type);
  });
});
