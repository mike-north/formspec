import { afterAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const packageDir = path.resolve(__dirname, "..", "..");
const cliPath = path.join(packageDir, "dist", "index.js");
const tempRoot = path.join(__dirname, "__dry_run_tmp__");

function createTempDir(prefix: string): string {
  fs.mkdirSync(tempRoot, { recursive: true });
  return fs.mkdtempSync(path.join(tempRoot, prefix));
}

function runCli(args: string[]): { output: string; status: number } {
  const result = spawnSync("node", [cliPath, ...args], {
    cwd: packageDir,
    encoding: "utf-8",
  });

  const output = `${result.stdout}${result.stderr}`;
  return {
    output,
    status: result.status ?? 1,
  };
}

function createClassOnlyFixture(baseDir: string): { tsPath: string } {
  const tsPath = path.join(baseDir, "class-only.ts");
  fs.writeFileSync(
    tsPath,
    [
      "export class CustomerProfile {",
      "  email!: string;",
      "  active!: boolean;",
      "}",
      "",
    ].join("\n")
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
      'import { formspec, field } from "@formspec/dsl";',
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
    expect(result.output).toContain(path.join(outDir, "formspecs", "ActivateParams", "schema.json"));
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
    expect(result.output).toContain(path.join(outDir, "formspecs", "ActivateParams", "schema.json"));
    expect(result.output).toContain(
      path.join(outDir, "formspecs", "ActivateParams", "ui_schema.json")
    );
    expect(result.output).not.toContain(path.join(outDir, "BillingPlan", "schema.json"));
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
});
