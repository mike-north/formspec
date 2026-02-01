/**
 * Tests for the type extraction logic.
 *
 * These tests verify that TypeScript types are correctly converted
 * to the TypeMetadata format.
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { extractTypeMetadata, type TypeMetadata } from "../type-extractor.js";

/**
 * Helper to create a TypeScript program from source code and extract
 * type metadata from a class declaration.
 */
function getTypeMetadataFromSource(source: string): Record<string, TypeMetadata> {
  const fileName = "test.ts";

  // Create a virtual file system
  const compilerHost = ts.createCompilerHost({});
  const originalGetSourceFile = compilerHost.getSourceFile.bind(compilerHost);

  compilerHost.getSourceFile = (name, languageVersion) => {
    if (name === fileName) {
      return ts.createSourceFile(name, source, languageVersion, true);
    }
    return originalGetSourceFile(name, languageVersion);
  };

  const program = ts.createProgram(
    [fileName],
    {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      strict: true,
      experimentalDecorators: true,
    },
    compilerHost
  );

  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) {
    throw new Error("Failed to create source file");
  }

  const checker = program.getTypeChecker();

  // Find the class declaration
  let classNode: ts.ClassDeclaration | undefined;
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isClassDeclaration(node)) {
      classNode = node;
    }
  });

  if (!classNode) {
    throw new Error("No class declaration found");
  }

  return extractTypeMetadata(classNode, checker);
}

describe("extractTypeMetadata", () => {
  describe("primitive types", () => {
    it("should extract string type", () => {
      const source = `
        class Test {
          name!: string;
        }
      `;
      const metadata = getTypeMetadataFromSource(source);

      expect(metadata.name).toEqual({ type: "string" });
    });

    it("should extract number type", () => {
      const source = `
        class Test {
          age!: number;
        }
      `;
      const metadata = getTypeMetadataFromSource(source);

      expect(metadata.age).toEqual({ type: "number" });
    });

    it("should extract boolean type", () => {
      const source = `
        class Test {
          active!: boolean;
        }
      `;
      const metadata = getTypeMetadataFromSource(source);

      expect(metadata.active).toEqual({ type: "boolean" });
    });
  });

  describe("optional types", () => {
    it("should mark optional properties", () => {
      const source = `
        class Test {
          name?: string;
        }
      `;
      const metadata = getTypeMetadataFromSource(source);

      expect(metadata.name).toEqual({ type: "string", optional: true });
    });
  });

  describe("nullable types", () => {
    it("should mark nullable properties", () => {
      const source = `
        class Test {
          name!: string | null;
        }
      `;
      const metadata = getTypeMetadataFromSource(source);

      expect(metadata.name).toEqual({ type: "string", nullable: true });
    });
  });

  describe("string literal unions (enums)", () => {
    it("should extract string literal union as enum", () => {
      const source = `
        class Test {
          country!: "us" | "ca" | "uk";
        }
      `;
      const metadata = getTypeMetadataFromSource(source);

      expect(metadata.country).toEqual({
        type: "enum",
        values: ["us", "ca", "uk"],
      });
    });

    it("should handle nullable string literal union", () => {
      const source = `
        class Test {
          country!: "us" | "ca" | null;
        }
      `;
      const metadata = getTypeMetadataFromSource(source);

      expect(metadata.country).toEqual({
        type: "enum",
        values: ["us", "ca"],
        nullable: true,
      });
    });
  });

  describe("number literal unions", () => {
    it("should extract number literal union as enum", () => {
      const source = `
        class Test {
          rating!: 1 | 2 | 3 | 4 | 5;
        }
      `;
      const metadata = getTypeMetadataFromSource(source);

      expect(metadata.rating).toEqual({
        type: "enum",
        values: [1, 2, 3, 4, 5],
      });
    });
  });

  describe("arrays", () => {
    it("should extract string array", () => {
      const source = `
        class Test {
          tags!: string[];
        }
      `;
      const metadata = getTypeMetadataFromSource(source);

      expect(metadata.tags).toEqual({
        type: "array",
        itemType: { type: "string" },
      });
    });

    it("should extract number array", () => {
      const source = `
        class Test {
          scores!: number[];
        }
      `;
      const metadata = getTypeMetadataFromSource(source);

      expect(metadata.scores).toEqual({
        type: "array",
        itemType: { type: "number" },
      });
    });
  });

  describe("objects", () => {
    it("should extract inline object type", () => {
      const source = `
        class Test {
          address!: { street: string; city: string };
        }
      `;
      const metadata = getTypeMetadataFromSource(source);

      expect(metadata.address).toEqual({
        type: "object",
        properties: {
          street: { type: "string" },
          city: { type: "string" },
        },
      });
    });

    it("should extract nested object with optional properties", () => {
      const source = `
        class Test {
          config!: { name: string; value?: number };
        }
      `;
      const metadata = getTypeMetadataFromSource(source);

      expect(metadata.config).toEqual({
        type: "object",
        properties: {
          name: { type: "string" },
          value: { type: "number", optional: true },
        },
      });
    });
  });

  describe("complex types", () => {
    it("should handle mixed types in a class", () => {
      const source = `
        class ContactForm {
          name!: string;
          email!: string;
          age?: number;
          country!: "us" | "ca" | "uk";
          tags!: string[];
          active!: boolean;
        }
      `;
      const metadata = getTypeMetadataFromSource(source);

      expect(metadata.name).toEqual({ type: "string" });
      expect(metadata.email).toEqual({ type: "string" });
      expect(metadata.age).toEqual({ type: "number", optional: true });
      expect(metadata.country).toEqual({
        type: "enum",
        values: ["us", "ca", "uk"],
      });
      expect(metadata.tags).toEqual({
        type: "array",
        itemType: { type: "string" },
      });
      expect(metadata.active).toEqual({ type: "boolean" });
    });
  });
});
