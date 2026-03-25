/**
 * Unit tests for ts-type-utils — TypeScript type classification helpers.
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import {
  stripNullableTypes,
  isBooleanLiteralUnion,
  isStringLiteralUnion,
  isNumberLiteralUnion,
} from "../analyzer/ts-type-utils.js";

/**
 * Resolves the TypeScript type of the first property in a class declared
 * in the given source string.
 */
function getFieldType(source: string): ts.Type {
  const fileName = "test.ts";
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const host = ts.createCompilerHost({});
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (
    name: string,
    ...args: Parameters<typeof host.getSourceFile> extends [string, ...infer R] ? R : never
  ) => {
    if (name === fileName) return sourceFile;
    return originalGetSourceFile(name, ...args);
  };

  const program = ts.createProgram([fileName], { strictNullChecks: true }, host);
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(fileName);
  if (!sf) throw new Error("Source file not found");

  let fieldType: ts.Type | undefined;
  ts.forEachChild(sf, (node) => {
    if (ts.isClassDeclaration(node)) {
      for (const member of node.members) {
        if (ts.isPropertyDeclaration(member) && fieldType === undefined) {
          fieldType = checker.getTypeAtLocation(member);
        }
      }
    }
  });

  if (!fieldType) throw new Error("No field type found");
  return fieldType;
}

// ============================================================================
// stripNullableTypes
// ============================================================================

describe("stripNullableTypes", () => {
  it("removes null from a union", () => {
    const type = getFieldType(`class C { x!: string | null; }`);
    expect(type.isUnion()).toBe(true);
    const stripped = stripNullableTypes((type as ts.UnionType).types);
    expect(stripped.every((t) => !(t.flags & ts.TypeFlags.Null))).toBe(true);
  });

  it("removes undefined from a union", () => {
    const type = getFieldType(`class C { x?: string; }`);
    // Optional fields become string | undefined
    expect(type.isUnion()).toBe(true);
    const stripped = stripNullableTypes((type as ts.UnionType).types);
    expect(stripped.every((t) => !(t.flags & ts.TypeFlags.Undefined))).toBe(true);
  });

  it("removes both null and undefined from a union", () => {
    const type = getFieldType(`class C { x!: string | null | undefined; }`);
    expect(type.isUnion()).toBe(true);
    const stripped = stripNullableTypes((type as ts.UnionType).types);
    expect(stripped).toHaveLength(1);
    const firstType = stripped[0];
    expect(firstType).toBeDefined();
    if (!firstType) throw new Error("Expected a type");
    expect(!!(firstType.flags & ts.TypeFlags.String)).toBe(true);
  });

  it("returns all types when none are nullable", () => {
    const type = getFieldType(`class C { x!: string | number; }`);
    expect(type.isUnion()).toBe(true);
    const members = (type as ts.UnionType).types;
    const stripped = stripNullableTypes(members);
    expect(stripped).toHaveLength(members.length);
  });

  it("returns an empty array for an empty input", () => {
    expect(stripNullableTypes([])).toEqual([]);
  });

  it("returns only-null types as empty after stripping", () => {
    // Construct manually — a pure [null, undefined] array
    const type = getFieldType(`class C { x!: null | undefined; }`);
    expect(type.isUnion()).toBe(true);
    const stripped = stripNullableTypes((type as ts.UnionType).types);
    expect(stripped).toHaveLength(0);
  });
});

// ============================================================================
// isBooleanLiteralUnion
// ============================================================================

describe("isBooleanLiteralUnion", () => {
  it("identifies boolean as a boolean literal union (true | false)", () => {
    const type = getFieldType(`class C { x!: boolean; }`);
    // TypeScript represents boolean as true | false at the type level
    expect(type.isUnion()).toBe(true);
    expect(isBooleanLiteralUnion((type as ts.UnionType).types)).toBe(true);
  });

  it("returns false for string literals", () => {
    const type = getFieldType(`class C { x!: "a" | "b"; }`);
    expect(type.isUnion()).toBe(true);
    expect(isBooleanLiteralUnion((type as ts.UnionType).types)).toBe(false);
  });

  it("returns false for a single boolean literal", () => {
    // true alone is BooleanLiteral but length is 1, not 2
    const type = getFieldType(`class C { x!: true; }`);
    // true is not a union, so we test with a fake single-element array
    const singleBoolType: ts.Type[] = [type];
    expect(isBooleanLiteralUnion(singleBoolType)).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(isBooleanLiteralUnion([])).toBe(false);
  });

  it("returns false for number | string union", () => {
    const type = getFieldType(`class C { x!: number | string; }`);
    expect(type.isUnion()).toBe(true);
    expect(isBooleanLiteralUnion((type as ts.UnionType).types)).toBe(false);
  });
});

// ============================================================================
// isStringLiteralUnion
// ============================================================================

describe("isStringLiteralUnion", () => {
  it("identifies a string literal union", () => {
    const type = getFieldType(`class C { x!: "a" | "b" | "c"; }`);
    expect(type.isUnion()).toBe(true);
    expect(isStringLiteralUnion((type as ts.UnionType).types)).toBe(true);
  });

  it("returns false for a mixed string and number literal union", () => {
    const type = getFieldType(`class C { x!: "a" | 1; }`);
    expect(type.isUnion()).toBe(true);
    expect(isStringLiteralUnion((type as ts.UnionType).types)).toBe(false);
  });

  it("returns false for plain string type", () => {
    const type = getFieldType(`class C { x!: string; }`);
    // string is not a union, test with a single-element array
    expect(isStringLiteralUnion([type])).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(isStringLiteralUnion([])).toBe(false);
  });

  it("returns false for boolean literal union", () => {
    const type = getFieldType(`class C { x!: boolean; }`);
    expect(type.isUnion()).toBe(true);
    expect(isStringLiteralUnion((type as ts.UnionType).types)).toBe(false);
  });
});

// ============================================================================
// isNumberLiteralUnion
// ============================================================================

describe("isNumberLiteralUnion", () => {
  it("identifies a number literal union", () => {
    const type = getFieldType(`class C { x!: 1 | 2 | 3; }`);
    expect(type.isUnion()).toBe(true);
    expect(isNumberLiteralUnion((type as ts.UnionType).types)).toBe(true);
  });

  it("returns false for a mixed number and string literal union", () => {
    const type = getFieldType(`class C { x!: 1 | "a"; }`);
    expect(type.isUnion()).toBe(true);
    expect(isNumberLiteralUnion((type as ts.UnionType).types)).toBe(false);
  });

  it("returns false for plain number type", () => {
    const type = getFieldType(`class C { x!: number; }`);
    // number is not a union, test with a single-element array
    expect(isNumberLiteralUnion([type])).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(isNumberLiteralUnion([])).toBe(false);
  });

  it("returns false for string literal union", () => {
    const type = getFieldType(`class C { x!: "x" | "y"; }`);
    expect(type.isUnion()).toBe(true);
    expect(isNumberLiteralUnion((type as ts.UnionType).types)).toBe(false);
  });
});
