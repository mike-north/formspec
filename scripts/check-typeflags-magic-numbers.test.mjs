/**
 * Self-tests for the TypeFlags magic-number checker.
 *
 * @see CLAUDE.md "TypeScript compiler API quirks across majors"
 * @see packages/eslint-plugin/src/utils/type-utils.ts (TypeFlags renumbering rationale)
 */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { checkTypeFlagsMagicNumbers } from "./check-typeflags-magic-numbers.mjs";

/**
 * The checker only scans files under a `packages/<name>/src/` directory
 * (see `isPackageSourceFile`), so fixtures must mirror that shape.
 *
 * @param {string} contents
 * @param {(root: string, target: string) => Promise<void>} testFn
 * @returns {Promise<void>}
 */
async function withFixtureFile(contents, testFn) {
  const root = await mkdtemp(path.join(tmpdir(), "formspec-typeflags-"));
  try {
    const srcDir = path.join(root, "packages", "fake-pkg", "src");
    await mkdir(srcDir, { recursive: true });
    const filePath = path.join(srcDir, "example.ts");
    await writeFile(filePath, contents, "utf8");

    await testFn(root, path.join(root, "packages"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

void describe("checkTypeFlagsMagicNumbers", () => {
  void describe("getFlags() call receivers", () => {
    void it("flags a magic number masked against type.getFlags()", async () => {
      await withFixtureFile(
        `
          declare const type: { getFlags(): number };
          const isNull = (type.getFlags() & 8) !== 0;
        `,
        (_root, target) => {
          const result = checkTypeFlagsMagicNumbers({ targets: [target] });
          assert.equal(result.ok, false);
          assert.equal(result.findings.length, 1);
          assert.equal(result.findings[0]?.literal, "8");
        }
      );
    });

    void it("does not flag type.getFlags() masked against a named enum member", async () => {
      await withFixtureFile(
        `
          import * as ts from "typescript";
          declare const type: { getFlags(): number };
          const isNull = (type.getFlags() & ts.TypeFlags.Null) !== 0;
        `,
        (_root, target) => {
          const result = checkTypeFlagsMagicNumbers({ targets: [target] });
          assert.equal(result.ok, true);
          assert.equal(result.findings.length, 0);
        }
      );
    });
  });

  void describe("const indirection", () => {
    void it("flags a magic number reached through a same-file const binding", async () => {
      await withFixtureFile(
        `
          declare const type: { flags: number };
          const NULL_FLAG = 8;
          const isNull = (type.flags & NULL_FLAG) !== 0;
        `,
        (_root, target) => {
          const result = checkTypeFlagsMagicNumbers({ targets: [target] });
          assert.equal(result.ok, false);
          assert.equal(result.findings.length, 1);
          assert.equal(result.findings[0]?.literal, "8");
        }
      );
    });

    void it("does not flag a const bound to a named enum member", async () => {
      await withFixtureFile(
        `
          import * as ts from "typescript";
          declare const type: { flags: number };
          const NULL_FLAG = ts.TypeFlags.Null;
          const isNull = (type.flags & NULL_FLAG) !== 0;
        `,
        (_root, target) => {
          const result = checkTypeFlagsMagicNumbers({ targets: [target] });
          assert.equal(result.ok, true);
          assert.equal(result.findings.length, 0);
        }
      );
    });

    void it("does not chase indirection through a non-const binding", async () => {
      await withFixtureFile(
        `
          declare const type: { flags: number };
          let nullFlag = 8;
          const isNull = (type.flags & nullFlag) !== 0;
        `,
        (_root, target) => {
          const result = checkTypeFlagsMagicNumbers({ targets: [target] });
          assert.equal(result.ok, true);
          assert.equal(result.findings.length, 0);
        }
      );
    });
  });

  void describe("flag-family-agnostic diagnostic", () => {
    void it("flags a magic number masked against symbol.flags without recommending TypeFlags", async () => {
      await withFixtureFile(
        `
          declare const symbol: { flags: number };
          const isClass = (symbol.flags & 4) !== 0;
        `,
        (_root, target) => {
          const result = checkTypeFlagsMagicNumbers({ targets: [target] });
          assert.equal(result.ok, false);
          assert.equal(result.findings.length, 1);
          assert.match(result.report, /ts\.SymbolFlags/);
          assert.match(result.report, /ts\.TypeFlags/);
        }
      );
    });
  });

  void describe("baseline behavior (regression guard)", () => {
    void it("flags a direct numeric literal masked against type.flags", async () => {
      await withFixtureFile(
        `
          declare const type: { flags: number };
          const isNull = (type.flags & 65536) !== 0;
        `,
        (_root, target) => {
          const result = checkTypeFlagsMagicNumbers({ targets: [target] });
          assert.equal(result.ok, false);
          assert.equal(result.findings.length, 1);
          assert.equal(result.findings[0]?.literal, "65536");
        }
      );
    });

    void it("flags each literal in a bitwise-OR mask chain", async () => {
      await withFixtureFile(
        `
          declare const type: { flags: number };
          const isPrimitive = (type.flags & (4 | 8 | 16)) !== 0;
        `,
        (_root, target) => {
          const result = checkTypeFlagsMagicNumbers({ targets: [target] });
          assert.equal(result.ok, false);
          assert.deepEqual(
            result.findings.map((finding) => finding.literal),
            ["4", "8", "16"]
          );
        }
      );
    });

    void it("does not flag a mask against an unrelated .flags receiver used with a call", async () => {
      await withFixtureFile(
        `
          declare function lookup(value: number): number;
          declare const object: { flags: number };
          const value = (object.flags & lookup(4)) !== 0;
        `,
        (_root, target) => {
          const result = checkTypeFlagsMagicNumbers({ targets: [target] });
          assert.equal(result.ok, true);
          assert.equal(result.findings.length, 0);
        }
      );
    });

    void it("does not flag numeric literals outside a flags bitmask expression", async () => {
      await withFixtureFile(
        `
          // Example: type.flags & 65536 checks for Null under TS 5.x.
          const unrelated = 65536;
        `,
        (_root, target) => {
          const result = checkTypeFlagsMagicNumbers({ targets: [target] });
          assert.equal(result.ok, true);
          assert.equal(result.findings.length, 0);
        }
      );
    });
  });

  void it("throws when a scan target does not exist", () => {
    assert.throws(
      () => checkTypeFlagsMagicNumbers({ targets: ["/nonexistent/path/for/testing"] }),
      {
        message: "Scan target does not exist: /nonexistent/path/for/testing",
      }
    );
  });
});
