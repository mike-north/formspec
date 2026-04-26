import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const guardScript = join(repoRoot, "scripts/check-typeflags-magic-numbers.mjs");

function writeFixture(fileName: string, contents: string): string {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "formspec-typeflags-guard-"));
  const filePath = join(fixtureRoot, fileName);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
  return fixtureRoot;
}

function runGuard(fixtureRoot: string) {
  return spawnSync(process.execPath, [guardScript, fixtureRoot], {
    encoding: "utf8",
  });
}

function parseReportedLiterals(stderr: string): string[] {
  return stderr
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const match = /\(found (?<literal>\d+)\)\.$/.exec(line);
      if (match?.groups?.["literal"] === undefined) {
        throw new Error(`Unexpected diagnostic line: ${line}`);
      }
      return match.groups["literal"];
    });
}

describe("TypeFlags magic-number guard", () => {
  it("allows named TypeFlags enum masks and numeric zero comparisons", () => {
    const fixtureRoot = writeFixture(
      "packages/example/src/valid.ts",
      `
        import * as ts from "typescript";

        export function isNullable(type: ts.Type): boolean {
          return (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) !== 0;
        }

        export function usesComputedMask(type: ts.Type): boolean {
          return (type.flags & lookupFlag(4)) !== 0;
        }

        // This comment documents a bad example: type.flags & 4
        export const documentation = "Avoid code like type.flags & 8";
      `
    );

    try {
      const result = runGuard(fixtureRoot);

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("ignores package files outside src", () => {
    const fixtureRoot = writeFixture(
      "packages/example/tests/fixture.ts",
      `
        export function legacyTestFixture(type: { flags: number }): boolean {
          return (type.flags & 4) !== 0;
        }
      `
    );

    try {
      const result = runGuard(fixtureRoot);

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("rejects numeric literals in masks adjacent to .flags checks", () => {
    const fixtureRoot = writeFixture(
      "packages/example/src/invalid.ts",
      `
        import * as ts from "typescript";

        export function isStringish(type: ts.Type): boolean {
          return (
            (type.flags & 4) !== 0 ||
            (8 & type.flags) !== 0 ||
            (type.flags & (16 | 32)) !== 0 ||
            (type.flags & (64 | ts.TypeFlags.StringLiteral)) !== 0
          );
        }
      `
    );

    try {
      const result = runGuard(fixtureRoot);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(parseReportedLiterals(result.stderr)).toEqual(["4", "8", "16", "32", "64"]);
      expect(result.stderr).toContain("invalid.ts");
      expect(result.stderr).toContain("Use a named TypeScript compiler flag enum member");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("reports missing scan targets without a stack trace", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "formspec-typeflags-guard-"));
    const missingTarget = join(fixtureRoot, "does-not-exist");

    try {
      const result = runGuard(missingTarget);

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(`Error: Scan target does not exist: ${missingTarget}`);
      expect(result.stderr).not.toContain("at ");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
