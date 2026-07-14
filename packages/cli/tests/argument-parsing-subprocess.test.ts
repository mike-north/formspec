/**
 * Regression coverage for issue #543: argument-parsing gaps in the CLI.
 *
 * Before this fix:
 * - `-o`/`--output` and `-c`/`--compiled` silently fell back to their
 *   defaults when given without a value (e.g. a trailing `-o`), instead of
 *   erroring like `--config`/`--enum-serialization` already did.
 * - A third positional argument (`formspec generate f.ts Foo Bar`) was
 *   silently dropped instead of surfacing as an error.
 * - The `--validate-only` failure summary ("Validation failed: ...") was
 *   printed to stdout via `console.log`, while per-diagnostic lines and the
 *   final exit reason correctly went to stderr — scripts that separate
 *   streams missed the failure summary.
 *
 * These are subprocess (UAT-layer) tests: they spawn the built CLI binary
 * and assert on its real exit code and stdout/stderr streams (kept
 * separate, unlike the combined-output helper in the sibling subprocess
 * suites, since several of these assertions are stream-specific), mirroring
 * the convention established in dry-run-subprocess.test.ts.
 *
 * @see https://github.com/mike-north/formspec/issues/543
 */

import { afterAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const packageDir = path.resolve(__dirname, "..");
const cliPath = path.join(packageDir, "dist", "index.js");
const tempRoot = path.join(os.tmpdir(), "formspec-cli-argument-parsing-test");

function createTempDir(prefix: string): string {
  fs.mkdirSync(tempRoot, { recursive: true });
  return fs.mkdtempSync(path.join(tempRoot, prefix));
}

// The CLI binary (dist/index.js) is built once by tests/global-setup.ts
// before any test file runs, so this suite doesn't need to build it itself.
function runCli(args: string[]): { stdout: string; stderr: string; status: number } {
  const result = spawnSync("node", [cliPath, ...args], {
    cwd: packageDir,
    encoding: "utf-8",
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status ?? 1,
  };
}

function createCleanFixture(baseDir: string): { tsPath: string } {
  const tsPath = path.join(baseDir, "clean.ts");
  fs.writeFileSync(
    tsPath,
    [
      "export class CleanExample {",
      "  /** @minimum 0 @maximum 10 */",
      "  count!: number;",
      "}",
      "",
    ].join("\n")
  );

  return { tsPath };
}

function createInvalidConstraintFixture(baseDir: string): { tsPath: string } {
  const tsPath = path.join(baseDir, "invalid-constraint.ts");
  fs.writeFileSync(
    tsPath,
    [
      "export class InvalidConstraintExample {",
      "  /** @minimum 10 @maximum 5 */",
      "  quantity!: number;",
      "}",
      "",
    ].join("\n")
  );

  return { tsPath };
}

describe("argument parsing subprocess", () => {
  afterAll(() => {
    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("exits non-zero with a clear missing-value message when -o/--output is given without a value", () => {
    const fixtureDir = createTempDir("missing-value-o-");
    const { tsPath } = createCleanFixture(fixtureDir);

    const result = runCli(["generate", tsPath, "CleanExample", "-o"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("missing value for -o/--output");
    expect(fs.existsSync(path.join(fixtureDir, "generated"))).toBe(false);
  });

  it("exits non-zero with a clear missing-value message when the long form --output is given without a value", () => {
    const fixtureDir = createTempDir("missing-value-output-");
    const { tsPath } = createCleanFixture(fixtureDir);

    const result = runCli(["generate", tsPath, "CleanExample", "--output"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("missing value for -o/--output");
  });

  it("exits non-zero with a clear missing-value message when -c/--compiled is given without a value", () => {
    const fixtureDir = createTempDir("missing-value-c-");
    const { tsPath } = createCleanFixture(fixtureDir);

    const result = runCli(["generate", tsPath, "CleanExample", "-c"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("missing value for -c/--compiled");
  });

  it("exits non-zero with a clear missing-value message when the long form --compiled is given without a value", () => {
    const fixtureDir = createTempDir("missing-value-compiled-");
    const { tsPath } = createCleanFixture(fixtureDir);

    const result = runCli(["generate", tsPath, "CleanExample", "--compiled"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("missing value for -c/--compiled");
  });

  it("still accepts -o followed by a real output directory (unchanged behavior)", () => {
    const fixtureDir = createTempDir("valid-o-");
    const { tsPath } = createCleanFixture(fixtureDir);
    const outDir = path.join(fixtureDir, "generated");

    const result = runCli(["generate", tsPath, "CleanExample", "-o", outDir]);

    expect(result.status).toBe(0);
  });

  it("errors and names the ignored argument when an unexpected third positional is given", () => {
    const fixtureDir = createTempDir("extra-positional-");
    const { tsPath } = createCleanFixture(fixtureDir);

    const result = runCli(["generate", tsPath, "CleanExample", "Extra"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Extra");
  });

  it("names the specific extra argument (not just the first) when multiple extras are given", () => {
    const fixtureDir = createTempDir("multi-extra-positional-");
    const { tsPath } = createCleanFixture(fixtureDir);

    const result = runCli(["generate", tsPath, "Foo", "Bar"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Bar");
  });

  it("writes the --validate-only failure summary to stderr (not stdout) and exits 1", () => {
    const fixtureDir = createTempDir("validate-only-fail-");
    const { tsPath } = createInvalidConstraintFixture(fixtureDir);
    const outDir = path.join(fixtureDir, "generated");

    const result = runCli([
      "generate",
      tsPath,
      "InvalidConstraintExample",
      "--validate-only",
      "-o",
      outDir,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Validation failed: constraint violations found.");
    expect(result.stdout).not.toContain("Validation failed: constraint violations found.");
  });

  it("keeps the --validate-only success summary on stdout", () => {
    const fixtureDir = createTempDir("validate-only-success-");
    const { tsPath } = createCleanFixture(fixtureDir);
    const outDir = path.join(fixtureDir, "generated");

    const result = runCli(["generate", tsPath, "CleanExample", "--validate-only", "-o", outDir]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Validation passed: no constraint violations.");
  });
});
