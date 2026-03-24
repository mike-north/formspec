/**
 * Tests for type applicability checking.
 *
 * Verifies that constraint tags are rejected when applied to incompatible
 * field types (e.g., @minLength on a number field).
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import { analyzeClass } from "../analyzer/class-analyzer.js";
import { generateClassSchemas } from "../generators/class-schema.js";

function getDiagnosticsFromSource(source: string) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-test-"));
  const filePath = path.join(tmpDir, "test.ts");
  fs.writeFileSync(filePath, source);

  try {
    const program = ts.createProgram([filePath], {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ES2020,
      strict: true,
    });
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) throw new Error("Source file not found");

    let classDecl: ts.ClassDeclaration | undefined;
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isClassDeclaration(node)) classDecl = node;
    });
    if (!classDecl) throw new Error("No class found");

    const analysis = analyzeClass(classDecl, checker);
    const { diagnostics } = generateClassSchemas(analysis, checker);

    return diagnostics;
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
}

describe("Type Applicability", () => {
  describe("string-only tags rejected on non-string types", () => {
    it("rejects @minLength on number field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @minLength 5 */
          count!: number;
        }
      `);
      expect(
        diags.some((d) => d.message.includes("@minLength") && d.message.includes("string"))
      ).toBe(true);
    });

    it("rejects @maxLength on number field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @maxLength 100 */
          count!: number;
        }
      `);
      expect(
        diags.some((d) => d.message.includes("@maxLength") && d.message.includes("string"))
      ).toBe(true);
    });

    it("rejects @pattern on number field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @pattern ^[0-9]+$ */
          count!: number;
        }
      `);
      expect(
        diags.some((d) => d.message.includes("@pattern") && d.message.includes("string"))
      ).toBe(true);
    });

    it("rejects @format on number field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @format email */
          count!: number;
        }
      `);
      expect(diags.some((d) => d.message.includes("@format") && d.message.includes("string"))).toBe(
        true
      );
    });
  });

  describe("numeric-only tags rejected on non-numeric types", () => {
    it("rejects @minimum on string field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @minimum 0 */
          name!: string;
        }
      `);
      expect(
        diags.some((d) => d.message.includes("@minimum") && d.message.includes("numeric"))
      ).toBe(true);
    });

    it("rejects @maximum on string field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @maximum 100 */
          name!: string;
        }
      `);
      expect(
        diags.some((d) => d.message.includes("@maximum") && d.message.includes("numeric"))
      ).toBe(true);
    });

    it("rejects @multipleOf on string field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @multipleOf 5 */
          name!: string;
        }
      `);
      expect(
        diags.some((d) => d.message.includes("@multipleOf") && d.message.includes("numeric"))
      ).toBe(true);
    });

    it("rejects @maxSigFig on string field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @maxSigFig 4 */
          name!: string;
        }
      `);
      expect(
        diags.some((d) => d.message.includes("@maxSigFig") && d.message.includes("numeric"))
      ).toBe(true);
    });

    it("rejects @maxDecimalPlaces on string field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @maxDecimalPlaces 2 */
          name!: string;
        }
      `);
      expect(
        diags.some((d) => d.message.includes("@maxDecimalPlaces") && d.message.includes("numeric"))
      ).toBe(true);
    });
  });

  describe("array-only tags rejected on non-array types", () => {
    it("rejects @minItems on string field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @minItems 1 */
          name!: string;
        }
      `);
      expect(
        diags.some((d) => d.message.includes("@minItems") && d.message.includes("array"))
      ).toBe(true);
    });

    it("rejects @maxItems on number field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @maxItems 10 */
          count!: number;
        }
      `);
      expect(
        diags.some((d) => d.message.includes("@maxItems") && d.message.includes("array"))
      ).toBe(true);
    });

    it("rejects @uniqueItems on string field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @uniqueItems */
          name!: string;
        }
      `);
      expect(
        diags.some((d) => d.message.includes("@uniqueItems") && d.message.includes("array"))
      ).toBe(true);
    });
  });

  describe("valid combinations produce no type errors", () => {
    it("allows @minimum on number field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @minimum 0 */
          count!: number;
        }
      `);
      const typeErrors = diags.filter((d) => d.message.includes("only applicable"));
      expect(typeErrors).toHaveLength(0);
    });

    it("allows @minLength on string field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @minLength 1 */
          name!: string;
        }
      `);
      const typeErrors = diags.filter((d) => d.message.includes("only applicable"));
      expect(typeErrors).toHaveLength(0);
    });

    it("allows @minItems on array field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @minItems 1 */
          items!: string[];
        }
      `);
      const typeErrors = diags.filter((d) => d.message.includes("only applicable"));
      expect(typeErrors).toHaveLength(0);
    });

    it("allows @format on string field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @format email */
          email!: string;
        }
      `);
      const typeErrors = diags.filter((d) => d.message.includes("only applicable"));
      expect(typeErrors).toHaveLength(0);
    });

    it("allows @maxSigFig on number field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @maxSigFig 4 */
          value!: number;
        }
      `);
      const typeErrors = diags.filter((d) => d.message.includes("only applicable"));
      expect(typeErrors).toHaveLength(0);
    });

    it("allows @minLength on nullable string field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @minLength 1 */
          name!: string | null;
        }
      `);
      const typeErrors = diags.filter((d) => d.message.includes("only applicable"));
      expect(typeErrors).toHaveLength(0);
    });

    it("allows @minimum on optional number field", () => {
      const diags = getDiagnosticsFromSource(`
        export class Foo {
          /** @minimum 0 */
          count?: number;
        }
      `);
      const typeErrors = diags.filter((d) => d.message.includes("only applicable"));
      expect(typeErrors).toHaveLength(0);
    });
  });
});
