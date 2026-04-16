import type {
  ConstraintNode,
  JsonValue,
  ObjectTypeNode,
  Provenance,
  ReferenceTypeNode,
  TypeNode,
} from "@formspec/core/internals";
import { describe, expect, it } from "vitest";
import {
  analyzeConstraintTargets,
  dereferenceAnalysisType,
  type AnalysisTypeRegistry,
} from "../internal.js";

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
  it("builds a resolved state for direct constraints without path targets", () => {
    const result = analyzeConstraintTargets("age", NUMBER_TYPE, [minimum(18, 4)], {});

    expect(result.diagnostics).toEqual([]);
    expect(result.targetStates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "resolved",
          targetName: "age",
        }),
      ])
    );
  });

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

  it("reports unknown path segments on targeted constraints", () => {
    const result = analyzeConstraintTargets(
      "discount",
      {
        kind: "object",
        properties: [
          {
            name: "percent",
            type: NUMBER_TYPE,
            optional: false,
            constraints: [],
            annotations: [],
            provenance: provenance(2),
          },
        ],
        additionalProperties: false,
      },
      [
        {
          ...minimum(0, 6),
          path: { segments: ["missing"] },
        },
      ],
      {}
    );

    expect(result.targetStates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "missing-property",
          segment: "missing",
        }),
      ])
    );
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNKNOWN_PATH_TARGET",
          severity: "error",
        }),
      ])
    );
  });

  it("reports unresolvable traversals through non-object types", () => {
    const result = analyzeConstraintTargets(
      "count",
      NUMBER_TYPE,
      [
        {
          ...minimum(0, 3),
          path: { segments: ["value"] },
        },
      ],
      {}
    );

    expect(result.targetStates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "unresolvable",
          targetName: "count.value",
        }),
      ])
    );
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TYPE_MISMATCH",
          severity: "error",
        }),
      ])
    );
  });

  it("resolves multi-segment path targets into nested properties", () => {
    const result = analyzeConstraintTargets(
      "payment",
      {
        kind: "object",
        properties: [
          {
            name: "nested",
            type: {
              kind: "object",
              properties: [
                {
                  name: "amount",
                  type: NUMBER_TYPE,
                  optional: false,
                  constraints: [],
                  annotations: [],
                  provenance: provenance(3),
                },
              ],
              additionalProperties: false,
            },
            optional: false,
            constraints: [],
            annotations: [],
            provenance: provenance(2),
          },
        ],
        additionalProperties: false,
      },
      [
        {
          ...minimum(10, 7),
          path: { segments: ["nested", "amount"] },
        },
      ],
      {}
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.targetStates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "resolved",
          targetName: "payment.nested.amount",
        }),
      ])
    );
  });

  it("allows built-in numeric constraints on custom types with builtinConstraintBroadenings", () => {
    const customType: TypeNode = {
      kind: "custom",
      typeId: "x-test/decimal/Decimal",
      payload: null,
    };
    const registry = {
      findConstraint: () => undefined,
      findConstraintTag: () => undefined,
      findBuiltinConstraintBroadening: (typeId: string, tagName: string) =>
        typeId === "x-test/decimal/Decimal" &&
        ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"].includes(
          tagName
        )
          ? { extensionId: "x-test/decimal", registration: {} }
          : undefined,
    };

    const result = analyzeConstraintTargets(
      "amount",
      customType,
      [minimum(0, 1), maximum(999, 2)],
      {},
      { extensionRegistry: registry }
    );

    expect(result.diagnostics).toEqual([]);
  });

  it("rejects built-in numeric constraints on custom types without broadenings", () => {
    const customType: TypeNode = {
      kind: "custom",
      typeId: "x-test/other/SomeType",
      payload: null,
    };
    const registry = {
      findConstraint: () => undefined,
      findConstraintTag: () => undefined,
      findBuiltinConstraintBroadening: () => undefined,
    };

    const result = analyzeConstraintTargets(
      "field",
      customType,
      [minimum(0, 1)],
      {},
      { extensionRegistry: registry }
    );

    expect(result.diagnostics).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length asserted above
    expect(result.diagnostics[0]!.code).toBe("TYPE_MISMATCH");
  });

  it("rejects built-in numeric constraints on custom types when no registry is provided", () => {
    const customType: TypeNode = {
      kind: "custom",
      typeId: "x-test/decimal/Decimal",
      payload: null,
    };

    const result = analyzeConstraintTargets("amount", customType, [minimum(0, 1)], {});

    expect(result.diagnostics).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length asserted above
    expect(result.diagnostics[0]!.code).toBe("TYPE_MISMATCH");
  });

  it("rejects built-in numeric constraints when registry lacks findBuiltinConstraintBroadening", () => {
    const customType: TypeNode = {
      kind: "custom",
      typeId: "x-test/decimal/Decimal",
      payload: null,
    };
    // Registry that implements ConstraintRegistryLike but omits the optional
    // findBuiltinConstraintBroadening method — broadening should not apply.
    const registry = {
      findConstraint: () => undefined,
      findConstraintTag: () => undefined,
    };

    const result = analyzeConstraintTargets(
      "amount",
      customType,
      [minimum(0, 1)],
      {},
      { extensionRegistry: registry }
    );

    expect(result.diagnostics).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length asserted above
    expect(result.diagnostics[0]!.code).toBe("TYPE_MISMATCH");
  });

  it("allows built-in numeric constraints on nullable custom union types with builtinConstraintBroadenings", () => {
    // Optional Decimal fields produce a union: Decimal | null.
    // The broadening registry should be consulted for the non-null member.
    const nullableDecimalType: TypeNode = {
      kind: "union",
      members: [
        { kind: "custom", typeId: "x-test/decimal/Decimal", payload: null },
        { kind: "primitive", primitiveKind: "null" },
      ],
    };
    const registry = {
      findConstraint: () => undefined,
      findConstraintTag: () => undefined,
      findBuiltinConstraintBroadening: (typeId: string, tagName: string) =>
        typeId === "x-test/decimal/Decimal" &&
        ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"].includes(
          tagName
        )
          ? { extensionId: "x-test/decimal", registration: {} }
          : undefined,
    };

    const result = analyzeConstraintTargets(
      "amount",
      nullableDecimalType,
      [minimum(0, 1), maximum(999, 2)],
      {},
      { extensionRegistry: registry }
    );

    expect(result.diagnostics).toEqual([]);
  });
});
