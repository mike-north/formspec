/**
 * Tests for type-aware value parsing in @showWhen/@hideWhen TSDoc tags.
 *
 * When a @showWhen or @hideWhen tag references a field, the value should be
 * parsed to match the TypeScript type of the referenced field:
 *   - boolean field → parse "true"/"false" to boolean
 *   - number field → parse via Number()
 *   - string / string-literal-union field → keep as string
 *   - unresolvable field → keep as string (best effort)
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import { analyzeClass } from "../analyzer/class-analyzer.js";
import { generateClassSchemas } from "../generators/class-schema.js";

function getUxSpecFromSource(source: string) {
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
    return generateClassSchemas(analysis, checker);
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
}

describe("showWhen/hideWhen type-aware value parsing", () => {
  it("parses boolean showWhen value when target field is boolean", () => {
    const { uxSpec } = getUxSpecFromSource(`
      export class Form {
        premium!: boolean;
        /** @showWhen premium true */
        premiumNote?: string;
      }
    `);
    const noteField = uxSpec.elements.find((e: { id: string }) => e.id === "premiumNote") as
      | { id: string; showWhen?: { field: string; value: unknown } }
      | undefined;
    expect(noteField?.showWhen).toBeDefined();
    expect(noteField?.showWhen?.value).toBe(true); // boolean, not "true"
  });

  it("parses boolean showWhen false value when target field is boolean", () => {
    const { uxSpec } = getUxSpecFromSource(`
      export class Form {
        active!: boolean;
        /** @showWhen active false */
        inactiveNote?: string;
      }
    `);
    const noteField = uxSpec.elements.find((e: { id: string }) => e.id === "inactiveNote") as
      | { id: string; showWhen?: { field: string; value: unknown } }
      | undefined;
    expect(noteField?.showWhen?.value).toBe(false); // boolean false, not "false"
  });

  it("parses numeric showWhen value when target field is number", () => {
    const { uxSpec } = getUxSpecFromSource(`
      export class Form {
        tier!: number;
        /** @showWhen tier 3 */
        tierNote?: string;
      }
    `);
    const noteField = uxSpec.elements.find((e: { id: string }) => e.id === "tierNote") as
      | { id: string; showWhen?: { field: string; value: unknown } }
      | undefined;
    expect(noteField?.showWhen?.value).toBe(3); // number, not "3"
  });

  it("keeps string value for string enum target field", () => {
    const { uxSpec } = getUxSpecFromSource(`
      export class Form {
        status!: "draft" | "active" | "archived";
        /** @showWhen status draft */
        draftNote?: string;
      }
    `);
    const noteField = uxSpec.elements.find((e: { id: string }) => e.id === "draftNote") as
      | { id: string; showWhen?: { field: string; value: unknown } }
      | undefined;
    expect(noteField?.showWhen?.value).toBe("draft"); // string
  });

  it("keeps string value for plain string target field", () => {
    const { uxSpec } = getUxSpecFromSource(`
      export class Form {
        role!: string;
        /** @showWhen role admin */
        adminPanel?: string;
      }
    `);
    const noteField = uxSpec.elements.find((e: { id: string }) => e.id === "adminPanel") as
      | { id: string; showWhen?: { field: string; value: unknown } }
      | undefined;
    expect(noteField?.showWhen?.value).toBe("admin");
  });

  it("parses boolean hideWhen value", () => {
    const { uxSpec } = getUxSpecFromSource(`
      export class Form {
        isDisabled!: boolean;
        /** @hideWhen isDisabled true */
        action?: string;
      }
    `);
    const actionField = uxSpec.elements.find((e: { id: string }) => e.id === "action") as
      | { id: string; hideWhen?: { field: string; value: unknown } }
      | undefined;
    expect(actionField?.hideWhen).toBeDefined();
    expect(actionField?.hideWhen?.value).toBe(true);
  });

  it("falls back to string when target field not found", () => {
    const { uxSpec } = getUxSpecFromSource(`
      export class Form {
        /** @showWhen unknownField someValue */
        note?: string;
      }
    `);
    const noteField = uxSpec.elements.find((e: { id: string }) => e.id === "note") as
      | { id: string; showWhen?: { field: string; value: unknown } }
      | undefined;
    expect(noteField?.showWhen?.value).toBe("someValue"); // string fallback
  });

  it("parses numeric hideWhen value when target field is number", () => {
    const { uxSpec } = getUxSpecFromSource(`
      export class Form {
        count!: number;
        /** @hideWhen count 0 */
        countDetails?: string;
      }
    `);
    const detailsField = uxSpec.elements.find((e: { id: string }) => e.id === "countDetails") as
      | { id: string; hideWhen?: { field: string; value: unknown } }
      | undefined;
    expect(detailsField?.hideWhen?.value).toBe(0); // number, not "0"
  });
});
