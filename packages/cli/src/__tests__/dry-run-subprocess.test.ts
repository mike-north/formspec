import { afterAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const packageDir = path.resolve(__dirname, "..", "..");
const cliPath = path.join(packageDir, "dist", "index.js");
const tempRoot = path.join(os.tmpdir(), "formspec-cli-dry-run-test");
const dslModuleUrl = pathToFileURL(path.resolve(packageDir, "..", "dsl", "dist", "index.js")).href;

function createTempDir(prefix: string): string {
  fs.mkdirSync(tempRoot, { recursive: true });
  return fs.mkdtempSync(path.join(tempRoot, prefix));
}

function runCli(args: string[]): { output: string; status: number } {
  ensureCliBuilt();

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

function ensureCliBuilt(): void {
  if (fs.existsSync(cliPath)) {
    return;
  }

  // This subprocess suite only needs the runnable CLI entrypoint.
  // Avoid `pnpm run build` here because the package build also runs
  // declaration generation and API Extractor, which pull in broader
  // workspace prerequisites unrelated to this runtime smoke test.
  const buildResult = spawnSync("pnpm", ["exec", "tsup"], {
    cwd: packageDir,
    encoding: "utf-8",
  });

  if (buildResult.status !== 0 || !fs.existsSync(cliPath)) {
    throw new Error(
      [
        "Failed to build CLI test artifact at dist/index.js.",
        buildResult.stdout,
        buildResult.stderr,
      ]
        .filter((part) => part.length > 0)
        .join("\n")
    );
  }
}

function createClassOnlyFixture(baseDir: string): { tsPath: string } {
  const tsPath = path.join(baseDir, "class-only.ts");
  fs.writeFileSync(
    tsPath,
    ["export class CustomerProfile {", "  email!: string;", "  active!: boolean;", "}", ""].join(
      "\n"
    )
  );

  return { tsPath };
}

function createRuntimeFixture(baseDir: string): { tsPath: string } {
  const tsPath = path.join(baseDir, "billing-plan.ts");
  const jsPath = path.join(baseDir, "billing-plan.js");

  fs.writeFileSync(
    tsPath,
    [
      'import { formspec, field, type InferFormSchema } from "@formspec/dsl";',
      "",
      "export const ActivateParams = formspec(",
      '  field.number("amount", { label: "Amount", required: true })',
      ");",
      "",
      "export class BillingPlan {",
      "  total!: number;",
      "",
      "  activate(params: InferFormSchema<typeof ActivateParams>): { success: boolean } {",
      "    return { success: params.amount > 0 };",
      "  }",
      "}",
      "",
    ].join("\n")
  );

  fs.writeFileSync(
    jsPath,
    [
      `import { formspec, field } from ${JSON.stringify(dslModuleUrl)};`,
      "",
      "export const ActivateParams = formspec(",
      '  field.number("amount", { label: "Amount", required: true })',
      ");",
      "",
      "export class BillingPlan {",
      "  activate(params) {",
      "    return { success: params.amount > 0 };",
      "  }",
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

describe("--dry-run subprocess", () => {
  afterAll(() => {
    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("reports class and method output paths without writing files", () => {
    const fixtureDir = createTempDir("class-with-runtime-");
    const { tsPath } = createRuntimeFixture(fixtureDir);
    const outDir = path.join(fixtureDir, "generated");

    const result = runCli(["generate", tsPath, "BillingPlan", "--dry-run", "-o", outDir]);

    expect(result.status).toBe(0);
    expect(result.output).toContain("Mode: dry run (no files will be written)");
    expect(result.output).toContain(path.join(outDir, "BillingPlan", "schema.json"));
    expect(result.output).toContain(path.join(outDir, "BillingPlan", "ui_schema.json"));
    expect(result.output).toContain(
      path.join(outDir, "BillingPlan", "instance_methods", "activate", "params.schema.json")
    );
    expect(result.output).toContain(
      path.join(outDir, "BillingPlan", "instance_methods", "activate", "params.ui_schema.json")
    );
    expect(result.output).toContain(
      path.join(outDir, "BillingPlan", "instance_methods", "activate", "return_type.schema.json")
    );
    expect(result.output).toContain(
      path.join(outDir, "formspecs", "ActivateParams", "schema.json")
    );
    expect(result.output).toContain(
      path.join(outDir, "formspecs", "ActivateParams", "ui_schema.json")
    );
    expect(result.output).toContain("Dry run complete: no files written.");
    expect(fs.existsSync(outDir)).toBe(false);
  });

  it("reports IR output paths for --emit-ir --validate-only without writing files", () => {
    const fixtureDir = createTempDir("emit-ir-");
    const { tsPath } = createRuntimeFixture(fixtureDir);
    const outDir = path.join(fixtureDir, "generated");

    const result = runCli([
      "generate",
      tsPath,
      "BillingPlan",
      "--emit-ir",
      "--validate-only",
      "--dry-run",
      "-o",
      outDir,
    ]);

    expect(result.status).toBe(0);
    expect(result.output).toContain(path.join(outDir, "BillingPlan.ir.json"));
    expect(result.output).toContain(path.join(outDir, "ActivateParams.ir.json"));
    expect(result.output).toContain("Validation passed: no constraint violations.");
    expect(result.output).toContain("Dry run complete: no files written.");
    expect(fs.existsSync(outDir)).toBe(false);
  });

  it("reports standalone FormSpec output paths without planning class files", () => {
    const fixtureDir = createTempDir("formspec-only-");
    const { tsPath } = createRuntimeFixture(fixtureDir);
    const outDir = path.join(fixtureDir, "generated");

    const result = runCli(["generate", tsPath, "--dry-run", "-o", outDir]);

    expect(result.status).toBe(0);
    expect(result.output).toContain(
      path.join(outDir, "formspecs", "ActivateParams", "schema.json")
    );
    expect(result.output).toContain(
      path.join(outDir, "formspecs", "ActivateParams", "ui_schema.json")
    );
    expect(result.output).not.toContain(path.join(outDir, "BillingPlan", "schema.json"));
    expect(fs.existsSync(outDir)).toBe(false);
  });

  it("uses the default generated output directory when -o is omitted", () => {
    const fixtureDir = createTempDir("default-outdir-");
    const { tsPath } = createClassOnlyFixture(fixtureDir);
    const defaultOutDir = path.join("generated", "CustomerProfile");

    const result = runCli(["generate", tsPath, "CustomerProfile", "--dry-run"]);

    expect(result.status).toBe(0);
    expect(result.output).toContain(path.join(defaultOutDir, "schema.json"));
    expect(result.output).toContain(path.join(defaultOutDir, "ui_schema.json"));
    expect(fs.existsSync(path.join(packageDir, "generated"))).toBe(false);
  });

  it("reports class-only dry runs without validate-only or emit-ir", () => {
    const fixtureDir = createTempDir("class-only-dry-run-");
    const { tsPath } = createClassOnlyFixture(fixtureDir);
    const outDir = path.join(fixtureDir, "generated");

    const result = runCli(["generate", tsPath, "CustomerProfile", "--dry-run", "-o", outDir]);

    expect(result.status).toBe(0);
    expect(result.output).toContain(path.join(outDir, "CustomerProfile", "schema.json"));
    expect(result.output).toContain(path.join(outDir, "CustomerProfile", "ui_schema.json"));
    expect(result.output).toContain("Dry run complete: no files written.");
    expect(fs.existsSync(outDir)).toBe(false);
  });

  it("keeps validate-only dry runs write-free when there is no IR emission", () => {
    const fixtureDir = createTempDir("validate-only-");
    const { tsPath } = createClassOnlyFixture(fixtureDir);
    const outDir = path.join(fixtureDir, "generated");

    const result = runCli([
      "generate",
      tsPath,
      "CustomerProfile",
      "--validate-only",
      "--dry-run",
      "-o",
      outDir,
    ]);

    expect(result.status).toBe(0);
    expect(result.output).toContain("Dry run: no files would be written.");
    expect(result.output).toContain("Validation passed: no constraint violations.");
    expect(fs.existsSync(outDir)).toBe(false);
  });

  it("preserves failing validation behavior during validate-only dry runs", () => {
    const fixtureDir = createTempDir("validate-only-invalid-");
    const { tsPath } = createInvalidConstraintFixture(fixtureDir);
    const outDir = path.join(fixtureDir, "generated");

    const result = runCli([
      "generate",
      tsPath,
      "InvalidConstraintExample",
      "--validate-only",
      "--dry-run",
      "-o",
      outDir,
    ]);

    expect(result.status).toBe(1);
    expect(result.output).toContain("CONTRADICTING_CONSTRAINTS");
    expect(result.output).toContain("Validation failed: constraint violations found.");
    expect(fs.existsSync(outDir)).toBe(false);
  });
});
