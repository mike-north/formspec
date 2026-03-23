/**
 * Unit tests for JSDoc constraint extraction.
 *
 * Verifies that {@link extractJSDocConstraints} correctly parses JSDoc
 * constraints into synthetic ConstraintInfo objects.
 *
 * @see packages/core/src/types/constraint-definitions.ts for BUILTIN_CONSTRAINT_DEFINITIONS
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import {
  extractJSDocConstraints,
  extractJSDocFieldMetadata,
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

describe("extractJSDocConstraints", () => {
  it("parses @Minimum with an integer value", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum 34 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Minimum", args: [34] });
  });

  it("parses @Maximum with an integer value", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Maximum 100 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Maximum", args: [100] });
  });

  it("parses @Pattern as a string value", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Pattern ^[a-z]+$ */
        x!: string;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Pattern", args: ["^[a-z]+$"] });
  });

  it("handles negative numbers", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum -10 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Minimum", args: [-10] });
  });

  it("handles decimal numbers", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Maximum 3.14 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Maximum", args: [3.14] });
  });

  it("handles negative decimal numbers", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum -273.15 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Minimum", args: [-273.15] });
  });

  it("ignores non-constraint tags like @deprecated and @param", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @deprecated Use something else @param foo */
        x!: number;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(0);
  });

  it("skips tags with malformed numeric values", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum abc */
        x!: number;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(0);
  });

  it("skips tags with empty values", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum */
        x!: number;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(0);
  });

  it("extracts multiple constraint tags from one comment", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum 0 @Maximum 100 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: "Minimum", args: [0] });
    expect(result[1]).toMatchObject({ name: "Maximum", args: [100] });
  });

  it("is case-sensitive: ignores lowercase @minimum", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @minimum 5 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(0);
  });

  it("parses all supported numeric tags", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum 1 @Maximum 10 @ExclusiveMinimum 0 @ExclusiveMaximum 11 @MinLength 2 @MaxLength 8 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(6);
    expect(result.map((d) => d.name)).toEqual([
      "Minimum",
      "Maximum",
      "ExclusiveMinimum",
      "ExclusiveMaximum",
      "MinLength",
      "MaxLength",
    ]);
  });

  it("returns an empty array for a node with no JSDoc", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        x!: number;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(0);
  });

  it("sets node to undefined (cast) on synthetic decorators", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum 5 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(1);
    // The node field is undefined cast as ts.Decorator
    expect(result[0]?.node).toBeUndefined();
  });

  it("handles zero as a valid numeric value", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Minimum 0 */
        x!: number;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Minimum", args: [0] });
  });
});

// ============================================================================
// @EnumOptions JSON parsing
// ============================================================================

describe("@EnumOptions JSON parsing", () => {
  it("parses a valid JSON string array", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions ["a","b","c"] */
        x!: string;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "EnumOptions", args: [["a", "b", "c"]] });
  });

  it("parses a valid JSON object array (labeled options)", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions [{"id":"low","label":"Low"},{"id":"high","label":"High"}] */
        x!: string;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "EnumOptions",
      args: [
        [
          { id: "low", label: "Low" },
          { id: "high", label: "High" },
        ],
      ],
    });
  });

  it("skips a JSON record (only arrays are accepted)", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions {"a":"Label A","b":"Label B"} */
        x!: string;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(0);
  });

  it("accepts an empty JSON array", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions [] */
        x!: string;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "EnumOptions", args: [[]] });
  });

  it("skips an empty JSON object", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions {} */
        x!: string;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(0);
  });

  it("skips malformed JSON syntax", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions ["unclosed */
        x!: string;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(0);
  });

  it("skips JSON with trailing comma", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions ["a","b",] */
        x!: string;
      }
    `);

    // JSON.parse rejects trailing commas
    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(0);
  });

  it("skips JSON string primitive", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions "not-an-array" */
        x!: string;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(0);
  });

  it("skips JSON number primitive", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions 42 */
        x!: string;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(0);
  });

  it("skips JSON boolean primitive", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions true */
        x!: string;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(0);
  });

  it("skips JSON null", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions null */
        x!: string;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(0);
  });

  it("coexists with other constraint tags", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @EnumOptions ["a","b"] @MinLength 1 */
        x!: string;
      }
    `);

    const result = extractJSDocConstraints(prop);
    expect(result).toHaveLength(2);
    expect(result.find((d) => d.name === "EnumOptions")).toMatchObject({
      args: [["a", "b"]],
    });
    expect(result.find((d) => d.name === "MinLength")).toMatchObject({
      args: [1],
    });
  });
});

// ============================================================================
// extractJSDocFieldMetadata
// ============================================================================

describe("extractJSDocFieldMetadata", () => {
  it("extracts @Field_displayName", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** @Field_displayName Full Name */
        name: string;
      }
    `);

    const result = extractJSDocFieldMetadata(prop);
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      name: "Field",
      args: [{ displayName: "Full Name" }],
    });
  });

  it("extracts @Field_description", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** @Field_description Help text for this field */
        name: string;
      }
    `);

    const result = extractJSDocFieldMetadata(prop);
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      name: "Field",
      args: [{ description: "Help text for this field" }],
    });
    // Should not have displayName when only description is present
    const opts = result?.args[0] as Record<string, unknown>;
    expect(opts["displayName"]).toBeUndefined();
  });

  it("extracts both @Field_displayName and @Field_description", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /**
         * @Field_displayName Full Name
         * @Field_description The user's legal name
         */
        name: string;
      }
    `);

    const result = extractJSDocFieldMetadata(prop);
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      name: "Field",
      args: [{ displayName: "Full Name", description: "The user's legal name" }],
    });
  });

  it("returns null when no metadata tags are present", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** @Minimum 0 */
        x: number;
      }
    `);

    const result = extractJSDocFieldMetadata(prop);
    expect(result).toBeNull();
  });

  it("returns null when no JSDoc comment exists", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        name: string;
      }
    `);

    const result = extractJSDocFieldMetadata(prop);
    expect(result).toBeNull();
  });

  it("skips tags with empty values", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** @Field_displayName */
        name: string;
      }
    `);

    const result = extractJSDocFieldMetadata(prop);
    expect(result).toBeNull();
  });

  it("skips tags with whitespace-only values", () => {
    const prop = getInterfacePropertyFromSource(`
      interface Foo {
        /** @Field_displayName    */
        name: string;
      }
    `);

    const result = extractJSDocFieldMetadata(prop);
    expect(result).toBeNull();
  });

  it("works on class properties too", () => {
    const prop = getPropertyFromSource(`
      class Foo {
        /** @Field_displayName Class Field */
        x!: string;
      }
    `);

    const result = extractJSDocFieldMetadata(prop);
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      name: "Field",
      args: [{ displayName: "Class Field" }],
    });
  });
});
