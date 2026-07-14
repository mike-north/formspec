/**
 * Regression coverage for issue #520: `formspec generate` could exit 0 despite
 * IR validation errors or silently dropped (throwing) chain-DSL exports.
 *
 * These are subprocess (UAT-layer) tests: they spawn the built CLI binary and
 * assert on its real exit code and stderr/stdout output, mirroring the
 * convention established in dry-run-subprocess.test.ts.
 *
 * @see https://github.com/mike-north/formspec/issues/520
 */

import { afterAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const packageDir = path.resolve(__dirname, "..");
const cliPath = path.join(packageDir, "dist", "index.js");
const tempRoot = path.join(os.tmpdir(), "formspec-cli-exit-codes-test");
const dslModuleUrl = pathToFileURL(path.resolve(packageDir, "..", "dsl", "dist", "index.js")).href;

function createTempDir(prefix: string): string {
  fs.mkdirSync(tempRoot, { recursive: true });
  return fs.mkdtempSync(path.join(tempRoot, prefix));
}

// The CLI binary (dist/index.js) is built once by tests/global-setup.ts
// before any test file runs, so this suite doesn't need to build it itself.
function runCli(args: string[]): { output: string; status: number } {
  const result = spawnSync("node", [cliPath, ...args], {
    cwd: packageDir,
    encoding: "utf-8",
  });

  const output = `${result.stdout}\n${result.stderr}`;
  return {
    output,
    status: result.status ?? 1,
  };
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

/**
 * Writes a source pair with one chain-DSL export built through the real DSL
 * (`GoodForm`) and one hand-crafted export that duck-types as a FormSpec
 * (satisfies `isFormSpec`) but carries an element with an unrecognized
 * `_type`. `canonicalizeChainDSL` throws `Unknown element type: ...` for it,
 * deterministically reproducing "schema generation throws" for one export
 * while a sibling export remains valid.
 */
function createMixedExportsFixture(baseDir: string): { tsPath: string } {
  const tsPath = path.join(baseDir, "mixed-exports.ts");
  const jsPath = path.join(baseDir, "mixed-exports.js");

  fs.writeFileSync(
    tsPath,
    [
      'import { formspec, field } from "@formspec/dsl";',
      "",
      "export const GoodForm = formspec(",
      '  field.text("name", { label: "Name", required: true })',
      ");",
      "",
    ].join("\n")
  );

  fs.writeFileSync(
    jsPath,
    [
      `import { formspec, field } from ${JSON.stringify(dslModuleUrl)};`,
      "",
      "export const GoodForm = formspec(",
      '  field.text("name", { label: "Name", required: true })',
      ");",
      "",
      "// Duck-types as a FormSpec (isFormSpec only checks `elements` + `_type`)",
      "// but its element kind is unrecognized, so canonicalization throws.",
      "export const BadForm = {",
      '  elements: [{ _type: "bogus-element-kind" }],',
      "};",
      "",
    ].join("\n")
  );

  return { tsPath };
}

/** A source pair whose only export fails canonicalization; no valid exports. */
function createAllFailingExportsFixture(baseDir: string): { tsPath: string } {
  const tsPath = path.join(baseDir, "all-failing.ts");
  const jsPath = path.join(baseDir, "all-failing.js");

  fs.writeFileSync(tsPath, "export {};\n");
  fs.writeFileSync(
    jsPath,
    [
      "export const OnlyBadForm = {",
      '  elements: [{ _type: "bogus-element-kind" }],',
      "};",
      "",
    ].join("\n")
  );

  return { tsPath };
}

/** A source pair with no class and no FormSpec-shaped exports at all. */
function createNoExportsFixture(baseDir: string): { tsPath: string } {
  const tsPath = path.join(baseDir, "no-exports.ts");
  const jsPath = path.join(baseDir, "no-exports.js");

  fs.writeFileSync(tsPath, "export {};\n");
  fs.writeFileSync(jsPath, "export const notAFormSpec = 42;\n");

  return { tsPath };
}

describe("exit codes subprocess", () => {
  afterAll(() => {
    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("exits non-zero when --emit-ir finds class constraint violations without --validate-only", () => {
    const fixtureDir = createTempDir("emit-ir-contradiction-");
    const { tsPath } = createInvalidConstraintFixture(fixtureDir);
    const outDir = path.join(fixtureDir, "generated");

    const result = runCli([
      "generate",
      tsPath,
      "InvalidConstraintExample",
      "--emit-ir",
      "-o",
      outDir,
    ]);

    expect(result.status).toBe(1);
    expect(result.output).toContain("CONTRADICTING_CONSTRAINTS");
    expect(result.output).not.toContain("Done!");
  });

  it("exits non-zero when --emit-ir hits a chain-DSL export that fails canonicalization", () => {
    const fixtureDir = createTempDir("emit-ir-bad-export-");
    const { tsPath } = createMixedExportsFixture(fixtureDir);
    const outDir = path.join(fixtureDir, "generated");

    const result = runCli(["generate", tsPath, "--emit-ir", "-o", outDir]);

    expect(result.status).toBe(1);
    expect(result.output).toContain("BadForm");
    expect(result.output).toContain("Unknown element type");
  });

  it("writes the valid export, reports the throwing export on stderr with name and cause, and exits non-zero", () => {
    const fixtureDir = createTempDir("mixed-exports-");
    const { tsPath } = createMixedExportsFixture(fixtureDir);
    const outDir = path.join(fixtureDir, "generated");

    const result = runCli(["generate", tsPath, "-o", outDir]);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("BadForm");
    expect(result.output).toContain("Unknown element type");
    expect(fs.existsSync(path.join(outDir, "formspecs", "GoodForm", "schema.json"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "formspecs", "GoodForm", "ui_schema.json"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "formspecs", "BadForm"))).toBe(false);
  });

  it('distinguishes "no exports found" from "exports present but all failed"', () => {
    const noExportsDir = createTempDir("no-exports-");
    const { tsPath: noExportsTsPath } = createNoExportsFixture(noExportsDir);
    const noExportsResult = runCli([
      "generate",
      noExportsTsPath,
      "-o",
      path.join(noExportsDir, "generated"),
    ]);

    const allFailingDir = createTempDir("all-failing-");
    const { tsPath: allFailingTsPath } = createAllFailingExportsFixture(allFailingDir);
    const allFailingResult = runCli([
      "generate",
      allFailingTsPath,
      "-o",
      path.join(allFailingDir, "generated"),
    ]);

    expect(noExportsResult.status).toBe(1);
    expect(noExportsResult.output).toContain(
      "No class name specified and no FormSpec exports found."
    );

    expect(allFailingResult.status).toBe(1);
    expect(allFailingResult.output).toContain("OnlyBadForm");
    expect(allFailingResult.output).not.toContain(
      "No class name specified and no FormSpec exports found."
    );
    expect(allFailingResult.output).toMatch(/found.*but all failed/);
  });

  it("keeps --validate-only exit 0 for a clean file with no constraint violations (unchanged semantics)", () => {
    const fixtureDir = createTempDir("validate-only-clean-");
    const tsPath = path.join(fixtureDir, "clean.ts");
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
    const outDir = path.join(fixtureDir, "generated");

    const result = runCli(["generate", tsPath, "CleanExample", "--validate-only", "-o", outDir]);

    expect(result.status).toBe(0);
    expect(result.output).toContain("Validation passed: no constraint violations.");
    expect(fs.existsSync(outDir)).toBe(false);
  });

  it("fails --validate-only when a chain-DSL export throws even with no constraint violations", () => {
    const fixtureDir = createTempDir("validate-only-bad-export-");
    const { tsPath } = createMixedExportsFixture(fixtureDir);
    const outDir = path.join(fixtureDir, "generated");

    const result = runCli(["generate", tsPath, "--validate-only", "-o", outDir]);

    expect(result.status).toBe(1);
    expect(result.output).toContain("Validation passed: no constraint violations.");
    expect(result.output).toContain("BadForm");
    expect(fs.existsSync(outDir)).toBe(false);
  });
});
