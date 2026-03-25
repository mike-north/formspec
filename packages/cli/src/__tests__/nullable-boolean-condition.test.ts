/**
 * Tests for Bug 4: Nullable boolean condition parsing.
 *
 * `boolean | null` in TypeScript is `true | false | null` (3 union members).
 * After filtering out null, 2 members remain (true | false), so the single-
 * element unwrap branch (`nonNull.length === 1`) does NOT fire. The
 * effectiveType stays as the full 3-member union, and the later boolean-union
 * check (length === 2) fails because it's checking the original 3-member union.
 *
 * The fix: perform the boolean-union check on the filtered nonNull members,
 * not on the original effectiveType.
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import { analyzeClass } from "../analyzer/class-analyzer.js";
import { generateClassSchemas } from "../generators/class-schema.js";

function getUxSpecFromSource(source: string): ReturnType<typeof generateClassSchemas> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-test-nullable-"));
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

// ============================================================================
// Bug 4: boolean | null — showWhen/hideWhen value must parse as boolean
// ============================================================================

describe("nullable boolean condition parsing — boolean | null field", () => {
  it("parses @showWhen true value as boolean true when target is boolean | null", () => {
    const { uxSpec } = getUxSpecFromSource(`
      export class Form {
        premium!: boolean | null;
        /** @showWhen premium true */
        premiumNote?: string;
      }
    `);
    const noteField = uxSpec.elements.find((e: { id: string }) => e.id === "premiumNote") as
      | { id: string; showWhen?: { field: string; value: unknown } }
      | undefined;
    expect(noteField?.showWhen).toBeDefined();
    // Must be boolean true, NOT string "true"
    expect(noteField?.showWhen?.value).toBe(true);
    expect(typeof noteField?.showWhen?.value).toBe("boolean");
  });

  it("parses @showWhen false value as boolean false when target is boolean | null", () => {
    const { uxSpec } = getUxSpecFromSource(`
      export class Form {
        active!: boolean | null;
        /** @showWhen active false */
        inactiveNote?: string;
      }
    `);
    const noteField = uxSpec.elements.find((e: { id: string }) => e.id === "inactiveNote") as
      | { id: string; showWhen?: { field: string; value: unknown } }
      | undefined;
    expect(noteField?.showWhen).toBeDefined();
    // Must be boolean false, NOT string "false"
    expect(noteField?.showWhen?.value).toBe(false);
    expect(typeof noteField?.showWhen?.value).toBe("boolean");
  });

  it("parses @hideWhen true value as boolean true when target is boolean | null", () => {
    const { uxSpec } = getUxSpecFromSource(`
      export class Form {
        isDisabled!: boolean | null;
        /** @hideWhen isDisabled true */
        action?: string;
      }
    `);
    const actionField = uxSpec.elements.find((e: { id: string }) => e.id === "action") as
      | { id: string; hideWhen?: { field: string; value: unknown } }
      | undefined;
    expect(actionField?.hideWhen).toBeDefined();
    expect(actionField?.hideWhen?.value).toBe(true);
    expect(typeof actionField?.hideWhen?.value).toBe("boolean");
  });

  it("parses @hideWhen false value as boolean false when target is boolean | null", () => {
    const { uxSpec } = getUxSpecFromSource(`
      export class Form {
        readOnly!: boolean | null;
        /** @hideWhen readOnly false */
        editButton?: string;
      }
    `);
    const editField = uxSpec.elements.find((e: { id: string }) => e.id === "editButton") as
      | { id: string; hideWhen?: { field: string; value: unknown } }
      | undefined;
    expect(editField?.hideWhen).toBeDefined();
    expect(editField?.hideWhen?.value).toBe(false);
    expect(typeof editField?.hideWhen?.value).toBe("boolean");
  });
});

// ============================================================================
// Regression guard: non-nullable boolean still works correctly
// ============================================================================

describe("nullable boolean condition parsing — non-nullable boolean still works", () => {
  it("plain boolean field still parses true as boolean true", () => {
    const { uxSpec } = getUxSpecFromSource(`
      export class Form {
        verified!: boolean;
        /** @showWhen verified true */
        verifiedNote?: string;
      }
    `);
    const noteField = uxSpec.elements.find((e: { id: string }) => e.id === "verifiedNote") as
      | { id: string; showWhen?: { field: string; value: unknown } }
      | undefined;
    expect(noteField?.showWhen?.value).toBe(true);
    expect(typeof noteField?.showWhen?.value).toBe("boolean");
  });

  it("plain boolean field still parses false as boolean false", () => {
    const { uxSpec } = getUxSpecFromSource(`
      export class Form {
        enabled!: boolean;
        /** @showWhen enabled false */
        disabledNote?: string;
      }
    `);
    const noteField = uxSpec.elements.find((e: { id: string }) => e.id === "disabledNote") as
      | { id: string; showWhen?: { field: string; value: unknown } }
      | undefined;
    expect(noteField?.showWhen?.value).toBe(false);
    expect(typeof noteField?.showWhen?.value).toBe("boolean");
  });
});

// ============================================================================
// Additional nullable types: number | null should still parse as number
// ============================================================================

describe("nullable condition parsing — number | null field", () => {
  it("parses numeric showWhen value as number when target is number | null", () => {
    const { uxSpec } = getUxSpecFromSource(`
      export class Form {
        tier!: number | null;
        /** @showWhen tier 3 */
        tierNote?: string;
      }
    `);
    const noteField = uxSpec.elements.find((e: { id: string }) => e.id === "tierNote") as
      | { id: string; showWhen?: { field: string; value: unknown } }
      | undefined;
    expect(noteField?.showWhen?.value).toBe(3);
    expect(typeof noteField?.showWhen?.value).toBe("number");
  });
});
