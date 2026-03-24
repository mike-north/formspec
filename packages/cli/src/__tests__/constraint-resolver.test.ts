/**
 * Unit tests for the type alias constraint resolver.
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { resolveTypeConstraints } from "../analyzer/constraint-resolver.js";
import type { CommentTagInfo } from "../analyzer/comment-tag-extractor.js";

/**
 * Creates an in-memory TypeScript program from source and returns the
 * checker and the type node for the first field of the first class.
 */
function makeFieldTypeNode(source: string): {
  typeNode: ts.TypeNode | undefined;
  checker: ts.TypeChecker;
} {
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

  const program = ts.createProgram([fileName], {}, host);
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(fileName);
  if (!sf) throw new Error("Source file not found");

  let typeNode: ts.TypeNode | undefined;
  ts.forEachChild(sf, (node) => {
    if (ts.isClassDeclaration(node)) {
      for (const member of node.members) {
        if (ts.isPropertyDeclaration(member) && typeNode === undefined) {
          typeNode = member.type;
        }
      }
    }
  });

  return { typeNode, checker };
}

function tagNames(tags: CommentTagInfo[]): string[] {
  return tags.map((t) => t.tagName);
}

function tagValue(tags: CommentTagInfo[], name: string): number | string | boolean | undefined {
  return tags.find((t) => t.tagName === name)?.value;
}

// ============================================================================
// Simple alias: Integer = number
// ============================================================================

describe("resolveTypeConstraints - simple alias", () => {
  const source = `
    /** @multipleOf 1 */
    type Integer = number;

    class TestClass {
      value!: Integer;
    }
  `;

  it("resolves multipleOf from a direct type alias", () => {
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { tags } = resolveTypeConstraints("value", typeNode, checker);
    expect(tagNames(tags)).toContain("multipleOf");
    expect(tagValue(tags, "multipleOf")).toBe(1);
  });

  it("returns no diagnostics for valid constraints", () => {
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { diagnostics } = resolveTypeConstraints("x", typeNode, checker);
    expect(diagnostics).toHaveLength(0);
  });
});

// ============================================================================
// Two-level alias: Percentage → Integer → number
// ============================================================================

describe("resolveTypeConstraints - two-level alias chain", () => {
  const source = `
    /** @multipleOf 1 */
    type Integer = number;

    /** @minimum 0 @maximum 100 */
    type Percentage = Integer;

    class TestClass {
      usage!: Percentage;
    }
  `;

  it("collects constraints from both levels", () => {
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { tags } = resolveTypeConstraints("value", typeNode, checker);
    expect(tagNames(tags)).toContain("minimum");
    expect(tagNames(tags)).toContain("maximum");
    expect(tagNames(tags)).toContain("multipleOf");
  });

  it("minimum comes from Percentage alias", () => {
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { tags } = resolveTypeConstraints("value", typeNode, checker);
    expect(tagValue(tags, "minimum")).toBe(0);
    expect(tagValue(tags, "maximum")).toBe(100);
  });

  it("multipleOf comes from Integer alias", () => {
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { tags } = resolveTypeConstraints("value", typeNode, checker);
    expect(tagValue(tags, "multipleOf")).toBe(1);
  });
});

// ============================================================================
// Merge logic: field-level @minimum overrides type's @minimum
// (handled in class-schema.ts by putting typeAliasTags before field tags,
//  but this tests the resolver's own merge for multi-level alias conflicts)
// ============================================================================

describe("resolveTypeConstraints - merge logic", () => {
  it("uses most restrictive minimum across alias levels (higher value wins)", () => {
    // Child alias has @minimum 5, parent has @minimum 0 → merged = max(0,5) = 5
    const source = `
      /** @minimum 0 */
      type Base = number;

      /** @minimum 5 */
      type Derived = Base;

      class TestClass {
        value!: Derived;
      }
    `;
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { tags } = resolveTypeConstraints("value", typeNode, checker);
    expect(tagValue(tags, "minimum")).toBe(5);
  });

  it("uses most restrictive maximum across alias levels (lower value wins)", () => {
    // Child has @maximum 80, parent has @maximum 100 → merged = min(100,80) = 80
    const source = `
      /** @maximum 100 */
      type Base = number;

      /** @maximum 80 */
      type Derived = Base;

      class TestClass {
        value!: Derived;
      }
    `;
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { tags } = resolveTypeConstraints("value", typeNode, checker);
    expect(tagValue(tags, "maximum")).toBe(80);
  });

  it("collects all multipleOf values (does not deduplicate)", () => {
    const source = `
      /** @multipleOf 2 */
      type Even = number;

      /** @multipleOf 3 */
      type EvenAndTriple = Even;

      class TestClass {
        value!: EvenAndTriple;
      }
    `;
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { tags } = resolveTypeConstraints("value", typeNode, checker);
    const multipleOfs = tags.filter((t) => t.tagName === "multipleOf").map((t) => t.value);
    expect(multipleOfs).toContain(2);
    expect(multipleOfs).toContain(3);
  });

  it("collects all pattern values", () => {
    // Note: avoid type alias names that shadow TypeScript built-ins (e.g. `Lowercase`).
    const source = `
      /** @pattern ^[a-z] */
      type StartsLower = string;

      /** @pattern [a-z]$ */
      type EndsLower = StartsLower;

      class TestClass {
        value!: EndsLower;
      }
    `;
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { tags } = resolveTypeConstraints("value", typeNode, checker);
    const patterns = tags.filter((t) => t.tagName === "pattern").map((t) => t.value);
    expect(patterns).toContain("^[a-z]");
    expect(patterns).toContain("[a-z]$");
  });
});

// ============================================================================
// No constraints on alias
// ============================================================================

describe("resolveTypeConstraints - no constraints", () => {
  it("returns empty tags when alias has no JSDoc tags", () => {
    const source = `
      type PlainAlias = number;

      class TestClass {
        value!: PlainAlias;
      }
    `;
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { tags } = resolveTypeConstraints("value", typeNode, checker);
    expect(tags).toHaveLength(0);
  });

  it("returns empty tags for primitive field types (no alias)", () => {
    const source = `
      class TestClass {
        value!: number;
      }
    `;
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { tags } = resolveTypeConstraints("value", typeNode, checker);
    expect(tags).toHaveLength(0);
  });

  it("returns empty tags when typeNode is undefined", () => {
    const source = `
      class TestClass {
        value!: number;
      }
    `;
    const { checker } = makeFieldTypeNode(source);
    const { tags } = resolveTypeConstraints("value", undefined, checker);
    expect(tags).toHaveLength(0);
  });
});

// ============================================================================
// Broadening detection (spec 005 §3.4)
// ============================================================================

describe("resolveTypeConstraints - broadening detection", () => {
  it("detects broadening of minimum (child lowers the floor)", () => {
    // Base has @minimum 5; derived tries @minimum 0 → ERROR: broadening
    const source = `
      /** @minimum 5 */
      type HighBound = number;

      /** @minimum 0 */
      type Broadened = HighBound;

      class TestClass {
        x!: Broadened;
      }
    `;
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { diagnostics } = resolveTypeConstraints("x", typeNode, checker);
    expect(diagnostics.some((d) => d.severity === "error" && d.message.includes("broaden"))).toBe(
      true
    );
  });

  it("includes fieldName in broadening diagnostics", () => {
    const source = `
      /** @minimum 5 */
      type HighBound = number;

      /** @minimum 0 */
      type Broadened = HighBound;

      class TestClass {
        myField!: Broadened;
      }
    `;
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { diagnostics } = resolveTypeConstraints("myField", typeNode, checker);
    expect(diagnostics.every((d) => d.fieldName === "myField")).toBe(true);
  });

  it("allows narrowing of minimum (child raises the floor)", () => {
    const source = `
      /** @minimum 0 */
      type LowBound = number;

      /** @minimum 5 */
      type Narrowed = LowBound;

      class TestClass {
        x!: Narrowed;
      }
    `;
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { diagnostics } = resolveTypeConstraints("x", typeNode, checker);
    const broadenErrors = diagnostics.filter((d) => d.message.includes("broaden"));
    expect(broadenErrors).toHaveLength(0);
  });

  it("detects broadening of maximum (child raises the ceiling)", () => {
    const source = `
      /** @maximum 100 */
      type Capped = number;

      /** @maximum 200 */
      type Broadened = Capped;

      class TestClass {
        x!: Broadened;
      }
    `;
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { diagnostics } = resolveTypeConstraints("x", typeNode, checker);
    expect(diagnostics.some((d) => d.severity === "error" && d.message.includes("broaden"))).toBe(
      true
    );
  });

  it("allows narrowing of maximum (child lowers the ceiling)", () => {
    const source = `
      /** @maximum 100 */
      type Capped = number;

      /** @maximum 80 */
      type Narrowed = Capped;

      class TestClass {
        x!: Narrowed;
      }
    `;
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { diagnostics } = resolveTypeConstraints("x", typeNode, checker);
    const broadenErrors = diagnostics.filter((d) => d.message.includes("broaden"));
    expect(broadenErrors).toHaveLength(0);
  });

  it("detects broadening of minLength", () => {
    const source = `
      /** @minLength 5 */
      type LongString = string;

      /** @minLength 1 */
      type BroadenedString = LongString;

      class TestClass {
        x!: BroadenedString;
      }
    `;
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { diagnostics } = resolveTypeConstraints("x", typeNode, checker);
    expect(diagnostics.some((d) => d.severity === "error" && d.message.includes("broaden"))).toBe(
      true
    );
  });

  it("detects broadening of maxLength", () => {
    const source = `
      /** @maxLength 10 */
      type ShortString = string;

      /** @maxLength 100 */
      type BroadenedString = ShortString;

      class TestClass {
        x!: BroadenedString;
      }
    `;
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { diagnostics } = resolveTypeConstraints("x", typeNode, checker);
    expect(diagnostics.some((d) => d.severity === "error" && d.message.includes("broaden"))).toBe(
      true
    );
  });

  it("detects broadening of minItems", () => {
    const source = `
      /** @minItems 3 */
      type NonEmptyList = string;

      /** @minItems 1 */
      type BroadenedList = NonEmptyList;

      class TestClass {
        x!: BroadenedList;
      }
    `;
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { diagnostics } = resolveTypeConstraints("x", typeNode, checker);
    expect(diagnostics.some((d) => d.severity === "error" && d.message.includes("broaden"))).toBe(
      true
    );
  });

  it("detects broadening of maxItems", () => {
    const source = `
      /** @maxItems 5 */
      type SmallList = string;

      /** @maxItems 50 */
      type BroadenedList = SmallList;

      class TestClass {
        x!: BroadenedList;
      }
    `;
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { diagnostics } = resolveTypeConstraints("x", typeNode, checker);
    expect(diagnostics.some((d) => d.severity === "error" && d.message.includes("broaden"))).toBe(
      true
    );
  });

  it("broadening diagnostic includes the tag name and values", () => {
    const source = `
      /** @minimum 10 */
      type Base = number;

      /** @minimum 1 */
      type Derived = Base;

      class TestClass {
        x!: Derived;
      }
    `;
    const { typeNode, checker } = makeFieldTypeNode(source);
    const { diagnostics } = resolveTypeConstraints("x", typeNode, checker);
    const broadenDiag = diagnostics.find((d) => d.message.includes("broaden"));
    expect(broadenDiag).toBeDefined();
    if (!broadenDiag) throw new Error("No broadening diagnostic found");
    // Message should mention the tag and the conflicting values
    expect(broadenDiag.message).toContain("minimum");
  });
});
