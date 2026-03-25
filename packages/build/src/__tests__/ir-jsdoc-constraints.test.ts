/**
 * Tests for JSDoc constraint and annotation extraction to IR nodes.
 *
 * Verifies that {@link extractJSDocConstraintNodes} produces
 * {@link ConstraintNode} and {@link extractJSDocAnnotationNodes} produces
 * {@link AnnotationNode} directly.
 *
 * @see packages/core/src/types/ir.ts for IR type definitions
 * @see packages/core/src/types/constraint-definitions.ts for BUILTIN_CONSTRAINT_DEFINITIONS
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import {
  extractJSDocConstraintNodes,
  extractJSDocAnnotationNodes,
} from "../analyzer/jsdoc-constraints.js";

/**
 * Helper: creates an in-memory TypeScript source file and returns the
 * first property declaration found in the first class.
 */
function getPropertyFromSource(source: string): ts.PropertyDeclaration {
  const sourceFile = ts.createSourceFile("test.ts", source, ts.ScriptTarget.Latest, true);

  for (const stmt of sourceFile.statements) {
    if (ts.isClassDeclaration(stmt)) {
      for (const member of stmt.members) {
        if (ts.isPropertyDeclaration(member)) {
          return member;
        }
      }
    }
  }

  throw new Error("No property declaration found in source");
}

/**
 * Helper: creates an in-memory TypeScript source file and returns the
 * first property signature found in the first interface.
 */
function getInterfacePropertyFromSource(source: string): ts.PropertySignature {
  const sourceFile = ts.createSourceFile("test.ts", source, ts.ScriptTarget.Latest, true);

  for (const stmt of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(stmt)) {
      for (const member of stmt.members) {
        if (ts.isPropertySignature(member)) {
          return member;
        }
      }
    }
  }

  throw new Error("No property signature found in source");
}

// =============================================================================
// extractJSDocConstraintNodes
// =============================================================================

describe("extractJSDocConstraintNodes", () => {
  it("produces NumericConstraintNode for @Minimum", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum 34 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop, "/test.ts");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "constraint",
      constraintKind: "minimum",
      value: 34,
    });
  });

  it("produces NumericConstraintNode for @Maximum", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Maximum 100 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "constraint",
      constraintKind: "maximum",
      value: 100,
    });
  });

  it("produces PatternConstraintNode for @Pattern", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Pattern ^[a-z]+$ */
        x!: string;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "constraint",
      constraintKind: "pattern",
      pattern: "^[a-z]+$",
    });
  });

  it("handles negative numbers", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum -10 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      constraintKind: "minimum",
      value: -10,
    });
  });

  it("handles decimal numbers", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Maximum 3.14 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      constraintKind: "maximum",
      value: 3.14,
    });
  });

  it("handles zero as a valid numeric value", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum 0 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ constraintKind: "minimum", value: 0 });
  });

  it("produces LengthConstraintNode for @MinLength and @MaxLength", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @MinLength 2 @MaxLength 8 */
        x!: string;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ constraintKind: "minLength", value: 2 });
    expect(result[1]).toMatchObject({ constraintKind: "maxLength", value: 8 });
  });

  it("produces NumericConstraintNode for @ExclusiveMinimum and @ExclusiveMaximum", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @ExclusiveMinimum 0 @ExclusiveMaximum 11 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ constraintKind: "exclusiveMinimum", value: 0 });
    expect(result[1]).toMatchObject({ constraintKind: "exclusiveMaximum", value: 11 });
  });

  it("produces allowedMembers ConstraintNode for @EnumOptions", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions ["a","b","c"] */
        x!: string;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "constraint",
      constraintKind: "allowedMembers",
      members: ["a", "b", "c"],
    });
  });

  it("extracts id values from labeled EnumOptions objects", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions [{"id":"low","label":"Low"},{"id":"high","label":"High"}] */
        x!: string;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      constraintKind: "allowedMembers",
      members: ["low", "high"],
    });
  });

  it("ignores non-constraint tags", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @deprecated Use something else @param foo */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(0);
  });

  it("skips tags with malformed numeric values", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum abc */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(0);
  });

  it("skips tags with empty values", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(0);
  });

  it("accepts lowercase (camelCase) constraint tags", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @minimum 5 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ constraintKind: "minimum", value: 5 });
  });

  it("returns empty array for node with no JSDoc", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(0);
  });

  it("includes provenance with tag name", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum 5 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraintNodes(prop, "/test.ts");
    expect(result).toHaveLength(1);
    expect(result[0]?.provenance.tagName).toBe("@minimum");
    expect(result[0]?.provenance.file).toBe("/test.ts");
    expect(result[0]?.provenance.surface).toBe("tsdoc");
    expect(result[0]?.provenance.line).toBeGreaterThan(0);
  });

  it("skips malformed JSON for @EnumOptions", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions ["unclosed */
        x!: string;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(0);
  });

  it("skips non-array JSON for @EnumOptions", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions {"a":"b"} */
        x!: string;
      }
    `);

    const result = extractJSDocConstraintNodes(prop);
    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// extractJSDocAnnotationNodes
// =============================================================================

describe("extractJSDocAnnotationNodes", () => {
  it("produces DisplayNameAnnotationNode for @displayName", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** @displayName Full Name */
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop, "/test.ts");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "annotation",
      annotationKind: "displayName",
      value: "Full Name",
    });
  });

  it("produces DescriptionAnnotationNode for @description", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** @description Help text for this field */
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "annotation",
      annotationKind: "description",
      value: "Help text for this field",
    });
  });

  it("produces both displayName and description", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /**
         * @displayName Full Name
         * @description The user's legal name
         */
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ annotationKind: "displayName", value: "Full Name" });
    expect(result[1]).toMatchObject({
      annotationKind: "description",
      value: "The user's legal name",
    });
  });

  it("produces DeprecatedAnnotationNode for @deprecated", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** @deprecated Use fullName instead */
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    const deprecated = result.find((a) => a.annotationKind === "deprecated");
    expect(deprecated).toBeDefined();
    expect(deprecated).toMatchObject({
      kind: "annotation",
      annotationKind: "deprecated",
    });
  });

  it("returns empty array when no metadata tags present", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** @Minimum 0 */
        x: number;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when no JSDoc comment exists", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    expect(result).toHaveLength(0);
  });

  it("skips tags with empty values", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** @displayName */
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    expect(result).toHaveLength(0);
  });

  it("includes provenance with tag name", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** @displayName Full Name */
        name: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop, "/test.ts");
    expect(result).toHaveLength(1);
    expect(result[0]?.provenance.tagName).toBe("@displayName");
    expect(result[0]?.provenance.file).toBe("/test.ts");
    expect(result[0]?.provenance.surface).toBe("tsdoc");
  });

  it("works on class properties too", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @displayName Class Field */
        x!: string;
      }
    `);

    const result = extractJSDocAnnotationNodes(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      annotationKind: "displayName",
      value: "Class Field",
    });
  });
});
