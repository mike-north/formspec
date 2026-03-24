/**
 * Unit tests for the comment tag extractor.
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { extractCommentTags } from "../analyzer/comment-tag-extractor.js";

function extractTagsFromSource(source: string): ReturnType<typeof extractCommentTags> {
  const fileName = "test.ts";
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  // Create a host that serves our in-memory source file
  const host = ts.createCompilerHost({});
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name: string, ...args: Parameters<typeof host.getSourceFile> extends [string, ...infer R] ? R : never) => {
    if (name === fileName) return sourceFile;
    return originalGetSourceFile(name, ...args);
  };

  const program = ts.createProgram([fileName], {}, host);
  const sf = program.getSourceFile(fileName);
  if (!sf) throw new Error("Source file not found");

  // Find the class property
  let property: ts.PropertyDeclaration | undefined;
  ts.forEachChild(sf, (node) => {
    if (ts.isClassDeclaration(node)) {
      for (const member of node.members) {
        if (ts.isPropertyDeclaration(member)) {
          property = member;
        }
      }
    }
  });

  if (!property) throw new Error("No property found");
  return extractCommentTags(property);
}

describe("Comment Tag Extractor", () => {
  describe("numeric constraint tags", () => {
    it("extracts @minimum and @maximum", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @minimum 0 @maximum 150 */
          age!: number;
        }
      `);
      expect(tags).toContainEqual({ tagName: "minimum", value: 0 });
      expect(tags).toContainEqual({ tagName: "maximum", value: 150 });
    });

    it("extracts negative @minimum", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @minimum -10 */
          x!: number;
        }
      `);
      expect(tags).toContainEqual({ tagName: "minimum", value: -10 });
    });

    it("extracts @exclusiveMinimum and @exclusiveMaximum", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @exclusiveMinimum 0 @exclusiveMaximum 100 */
          x!: number;
        }
      `);
      expect(tags).toContainEqual({ tagName: "exclusiveMinimum", value: 0 });
      expect(tags).toContainEqual({ tagName: "exclusiveMaximum", value: 100 });
    });

    it("extracts @multipleOf", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @multipleOf 5 */
          x!: number;
        }
      `);
      expect(tags).toContainEqual({ tagName: "multipleOf", value: 5 });
    });

    it("ignores @minimum with non-numeric value", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @minimum abc */
          x!: number;
        }
      `);
      expect(tags).toEqual([]);
    });

    it("ignores @minimum with empty comment", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @minimum */
          x!: number;
        }
      `);
      expect(tags).toEqual([]);
    });
  });

  describe("integer constraint tags", () => {
    it("extracts @minLength, @maxLength", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @minLength 5 @maxLength 100 */
          email!: string;
        }
      `);
      expect(tags).toContainEqual({ tagName: "minLength", value: 5 });
      expect(tags).toContainEqual({ tagName: "maxLength", value: 100 });
    });

    it("extracts @minItems and @maxItems", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @minItems 1 @maxItems 10 */
          items!: string[];
        }
      `);
      expect(tags).toContainEqual({ tagName: "minItems", value: 1 });
      expect(tags).toContainEqual({ tagName: "maxItems", value: 10 });
    });

    it("ignores negative @minLength", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @minLength -1 */
          x!: string;
        }
      `);
      expect(tags).toEqual([]);
    });

    it("ignores @minLength with fractional value", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @minLength 1.5 */
          x!: string;
        }
      `);
      expect(tags).toEqual([]);
    });
  });

  describe("pattern tag", () => {
    it("extracts @pattern", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @minLength 5 @maxLength 100 @pattern ^[^@]+@[^@]+$ */
          email!: string;
        }
      `);
      expect(tags).toContainEqual({ tagName: "pattern", value: "^[^@]+@[^@]+$" });
    });

    it("ignores invalid @pattern regex", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @pattern [invalid */
          x!: string;
        }
      `);
      expect(tags).toEqual([]);
    });
  });

  describe("bare tags", () => {
    it("extracts @deprecated bare tag", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @deprecated */
          old!: string;
        }
      `);
      expect(tags).toContainEqual({ tagName: "deprecated", value: undefined });
    });

    it("extracts @uniqueItems bare tag", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @uniqueItems */
          items!: string[];
        }
      `);
      expect(tags).toContainEqual({ tagName: "uniqueItems", value: undefined });
    });
  });

  describe("text annotation tags", () => {
    it("extracts @displayName text tag", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @displayName Full Name */
          name!: string;
        }
      `);
      expect(tags).toContainEqual({ tagName: "displayName", value: "Full Name" });
    });

    it("extracts @description text tag", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @description A description of the field */
          x!: string;
        }
      `);
      expect(tags).toContainEqual({ tagName: "description", value: "A description of the field" });
    });

    it("ignores @displayName with empty comment", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @displayName */
          x!: string;
        }
      `);
      expect(tags).toEqual([]);
    });
  });

  describe("defaultValue tag", () => {
    it("extracts numeric @defaultValue", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @defaultValue 42 */
          x!: number;
        }
      `);
      expect(tags).toContainEqual({ tagName: "defaultValue", value: 42 });
    });

    it("extracts string @defaultValue", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @defaultValue hello */
          x!: string;
        }
      `);
      expect(tags).toContainEqual({ tagName: "defaultValue", value: "hello" });
    });

    it("extracts boolean @defaultValue", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @defaultValue true */
          x!: boolean;
        }
      `);
      expect(tags).toContainEqual({ tagName: "defaultValue", value: true });
    });
  });

  describe("const tag", () => {
    it("extracts numeric @const", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @const 42 */
          x!: number;
        }
      `);
      expect(tags).toContainEqual({ tagName: "const", value: 42 });
    });

    it("extracts string @const", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @const "hello" */
          x!: string;
        }
      `);
      expect(tags).toContainEqual({ tagName: "const", value: "hello" });
    });
  });

  describe("unknown tags", () => {
    it("ignores unknown tags", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @foobar 123 */
          x!: number;
        }
      `);
      expect(tags).toEqual([]);
    });

    it("ignores @param and other standard JSDoc tags", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @type {string} */
          x!: string;
        }
      `);
      expect(tags).toEqual([]);
    });
  });

  describe("multiple tags in one comment", () => {
    it("extracts all tags from a single comment block", () => {
      const tags = extractTagsFromSource(`
        class Foo {
          /** @minimum 0 @maximum 150 @displayName Age */
          age!: number;
        }
      `);
      expect(tags).toHaveLength(3);
      expect(tags).toContainEqual({ tagName: "minimum", value: 0 });
      expect(tags).toContainEqual({ tagName: "maximum", value: 150 });
      expect(tags).toContainEqual({ tagName: "displayName", value: "Age" });
    });
  });
});
