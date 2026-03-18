/**
 * Unit tests for JSDoc constraint tag extraction.
 *
 * Verifies that {@link extractJSDocConstraints} correctly parses TSDoc
 * constraint tags into synthetic DecoratorInfo objects.
 *
 * @see packages/core/src/types/decorators.ts for CONSTRAINT_TAG_DEFINITIONS
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { extractJSDocConstraints } from "../analyzer/jsdoc-constraints.js";

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
