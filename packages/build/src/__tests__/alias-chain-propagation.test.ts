/**
 * Tests for transitive type alias constraint propagation.
 *
 * Verifies that constraints declared on type aliases propagate transitively
 * through alias chains (e.g., Integer → Percentage → field), and that
 * excessively deep chains throw a clear error.
 */

import { describe, it, expect } from "vitest";
import * as path from "node:path";
import type { FieldNode, ConstraintNode } from "@formspec/core";
import { createProgramContext, findClassByName } from "../analyzer/program.js";
import { analyzeClassToIR } from "../analyzer/class-analyzer.js";

const fixturePath = path.join(__dirname, "fixtures", "alias-chains.ts");

function analyzeClass(className: string) {
  const ctx = createProgramContext(fixturePath);
  const classDecl = findClassByName(ctx.sourceFile, className);
  if (!classDecl) throw new Error(`Class "${className}" not found`);
  return analyzeClassToIR(classDecl, ctx.checker, fixturePath);
}

function findField(fields: readonly FieldNode[], name: string): FieldNode {
  const field = fields.find((f) => f.name === name);
  if (!field) throw new Error(`Field "${name}" not found`);
  return field;
}

function findConstraint(
  constraints: readonly ConstraintNode[],
  kind: string
): ConstraintNode | undefined {
  return constraints.find((c) => c.constraintKind === kind);
}

function findTypeConstraints(
  analysis: ReturnType<typeof analyzeClass>,
  typeName: string
): readonly ConstraintNode[] {
  return analysis.typeRegistry[typeName]?.constraints ?? [];
}

describe("transitive type alias constraint propagation", () => {
  describe("2-level chain: Integer → Percentage → field", () => {
    it("propagates constraints from both Percentage and Integer", () => {
      const analysis = analyzeClass("TwoLevelChain");
      const mem = findField(analysis.fields, "memoryUsage");
      const constraints = findTypeConstraints(analysis, "Percentage");

      expect(mem.type).toEqual({ kind: "reference", name: "Percentage", typeArguments: [] });
      // From Percentage: @Minimum 0, @Maximum 100
      expect(findConstraint(constraints, "minimum")).toMatchObject({ value: 0 });
      expect(findConstraint(constraints, "maximum")).toMatchObject({ value: 100 });
      // From Integer (transitive): @MultipleOf 1
      expect(findConstraint(constraints, "multipleOf")).toMatchObject({ value: 1 });
    }, 15_000);

    it("collects both alias-level and field-level constraints for the same kind", () => {
      const analysis = analyzeClass("TwoLevelChain");
      const cpu = findField(analysis.fields, "cpuUsage");
      const aliasMinimums = findTypeConstraints(analysis, "Percentage").filter(
        (c) => c.constraintKind === "minimum"
      );

      expect(cpu.type).toEqual({ kind: "reference", name: "Percentage", typeArguments: [] });
      expect(aliasMinimums).toHaveLength(1);
      expect(aliasMinimums[0]).toMatchObject({ value: 0 });

      // Field-level constraints remain on the field and override alias constraints downstream.
      const fieldMinimums = cpu.constraints.filter((c) => c.constraintKind === "minimum");
      expect(fieldMinimums).toHaveLength(1);
      expect(fieldMinimums[0]).toMatchObject({ value: 10 });
    });
  });

  describe("3-level chain: Base → Mid → Leaf → field", () => {
    it("propagates constraints from all three alias levels", () => {
      const analysis = analyzeClass("ThreeLevelChain");
      const value = findField(analysis.fields, "value");
      const constraints = findTypeConstraints(analysis, "Leaf");

      expect(value.type).toEqual({ kind: "reference", name: "Leaf", typeArguments: [] });
      // From Leaf: @MultipleOf 5
      expect(findConstraint(constraints, "multipleOf")).toMatchObject({ value: 5 });
      // From Mid: @Maximum 1000
      expect(findConstraint(constraints, "maximum")).toMatchObject({ value: 1000 });
      // From Base: @Minimum 0
      expect(findConstraint(constraints, "minimum")).toMatchObject({ value: 0 });
    });

    it("collects exactly 3 constraints from the chain", () => {
      const analysis = analyzeClass("ThreeLevelChain");
      const value = findField(analysis.fields, "value");
      const constraints = findTypeConstraints(analysis, "Leaf");

      expect(value.type).toEqual({ kind: "reference", name: "Leaf", typeArguments: [] });
      expect(constraints).toHaveLength(3);
      const kinds = new Set(constraints.map((c) => c.constraintKind));
      expect(kinds).toEqual(new Set(["multipleOf", "maximum", "minimum"]));
    });
  });

  describe("no alias chain", () => {
    it("field-level constraints work without any alias", () => {
      const analysis = analyzeClass("NoAlias");
      const count = findField(analysis.fields, "count");

      expect(findConstraint(count.constraints, "minimum")).toMatchObject({ value: 0 });
      expect(count.constraints).toHaveLength(1);
    });
  });

  describe("max depth exceeded", () => {
    it("throws when alias chain exceeds 8 levels", () => {
      expect(() => analyzeClass("ExceedsMaxDepth")).toThrow(
        /type alias chain exceeds maximum depth of 8/i
      );
    });
  });
});
