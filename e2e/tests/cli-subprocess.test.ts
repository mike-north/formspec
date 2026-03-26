import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { findSchemaFile, runCli, resolveFixture } from "../helpers/schema-assertions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("CLI subprocess", () => {
  let tempDir: string;
  const multiClassTs = `
export class PrimaryReport {
  id!: string;
  title!: string;
}

export class SecondaryReport {
  status!: "draft" | "published";
}
  `;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(__dirname, "..", ".cli-subprocess-"));
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe("help", () => {
    it("shows help with --help", () => {
      const result = runCli(["--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("FormSpec CLI");
    });

    it("shows help with -h", () => {
      const result = runCli(["-h"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("FormSpec CLI");
    });

    it("shows generate subcommand help", () => {
      const result = runCli(["generate", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("--emit-ir");
      expect(result.stdout).toContain("--validate-only");
    });
  });

  describe("--emit-ir", () => {
    it("writes an IR file alongside generated schemas", () => {
      const fixturePath = resolveFixture("cli", "simple-order.ts");
      const outDir = path.join(tempDir, "emit-ir");
      const result = runCli(["generate", fixturePath, "SimpleOrder", "--emit-ir", "-o", outDir]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Wrote IR");

      const jsonFiles = findAllJsonFiles(outDir);
      expect(jsonFiles.some((file) => file.endsWith("SimpleOrder.ir.json"))).toBe(true);
      expect(jsonFiles.some((file) => file.endsWith(path.join("SimpleOrder", "schema.json")))).toBe(
        true
      );
      expect(
        jsonFiles.some((file) => file.endsWith(path.join("SimpleOrder", "ui_schema.json")))
      ).toBe(true);

      const irPath = jsonFiles.find((file) => file.endsWith("SimpleOrder.ir.json"));
      expect(irPath).toBeDefined();
      if (!irPath) throw new Error("IR file not found");

      const ir = readJson(irPath) as {
        kind: string;
        irVersion: unknown;
        elements: unknown[];
        provenance: { surface: string };
      };
      expect(ir.kind).toBe("form-ir");
      expect(ir.irVersion).toBeDefined();
      expect(Array.isArray(ir.elements)).toBe(true);
      expect(ir.elements.length).toBeGreaterThan(0);
      expect(ir.provenance.surface).toBe("tsdoc");
    });
  });

  describe("--validate-only", () => {
    it("does not write schema files", () => {
      const fixturePath = resolveFixture("cli", "simple-order.ts");
      const outDir = path.join(tempDir, "validate-only");
      const result = runCli(["generate", fixturePath, "SimpleOrder", "--validate-only", "-o", outDir]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Validation passed");
      expect(fs.existsSync(outDir)).toBe(false);
    });
  });

  describe("multiple classes and exports", () => {
    it("generates only the selected class when a class name is provided", () => {
      const { tsPath } = writeTempFixture(tempDir, "multi-class", multiClassTs);
      const outDir = path.join(tempDir, "multi-mode-class");
      const result = runCli(["generate", tsPath, "PrimaryReport", "-o", outDir]);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(path.join(outDir, "PrimaryReport"))).toBe(true);
      expect(fs.existsSync(path.join(outDir, "SecondaryReport"))).toBe(false);
    });

    it("generates only exported FormSpecs when no class name is provided", () => {
      const { tsPath, jsPath } = writeTempFixture(
        tempDir,
        "multi-mode-exports",
        `
export class PrimaryReport {
  id!: string;
}

export class SecondaryReport {
  status!: "draft" | "published";
}
`,
        `
import { formspec, field } from "@formspec/dsl";

export const UserRegistrationForm = formspec(
  field.text("username", { label: "Username", required: true }),
  field.text("email", { label: "Email Address", required: true }),
  field.boolean("acceptTerms", { label: "Accept Terms", required: true })
);

export const ProductConfigForm = formspec(
  field.text("name", { label: "Product Name", required: true }),
  field.number("price", { label: "Price (cents)", min: 0 })
);
`
      );

      if (!jsPath) throw new Error("Expected compiled multi-mode exports fixture");
      const outDir = path.join(tempDir, "multi-mode-exports");
      const result = runCli(["generate", tsPath, "--compiled", jsPath, "-o", outDir]);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(path.join(outDir, "formspecs", "UserRegistrationForm"))).toBe(true);
      expect(fs.existsSync(path.join(outDir, "formspecs", "ProductConfigForm"))).toBe(true);
      expect(fs.existsSync(path.join(outDir, "PrimaryReport"))).toBe(false);
      expect(fs.existsSync(path.join(outDir, "SecondaryReport"))).toBe(false);
    });
  });

  describe("error handling", () => {
    it("fails for non-existent file", () => {
      const result = runCli(["generate", "/tmp/does-not-exist-xyz.ts", "Foo", "-o", tempDir]);
      expect(result.exitCode).not.toBe(0);
    });

    it("fails with unknown command", () => {
      const result = runCli(["bogus-command"]);
      expect(result.exitCode).not.toBe(0);
    });

    it("fails for non-existent class name", () => {
      const fixturePath = resolveFixture("cli", "simple-order.ts");
      const result = runCli(["generate", fixturePath, "NonExistentClass", "-o", tempDir]);
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toContain("not found");
    });

    it("fails with a helpful syntax error message", () => {
      const { tsPath } = writeTempFixture(
        tempDir,
        "syntax-error",
        `
export class BrokenForm {
  name!: string
`
      );

      const result = runCli(["generate", tsPath, "BrokenForm", "-o", tempDir]);
      const output = result.stdout + result.stderr;

      expect(result.exitCode).not.toBe(0);
      expect(output).toContain("TypeScript syntax error(s)");
      expect(output).toContain("syntax-error.ts");
      expect(output).not.toMatch(/\n\s*at\s+/);
    });

    it("fails cleanly when the compiled file is missing", () => {
      const fixturePath = resolveFixture("cli", "simple-order.ts");
      const result = runCli(["generate", fixturePath, "-o", tempDir]);
      const output = result.stdout + result.stderr;

      expect(result.exitCode).not.toBe(0);
      expect(output).toContain("the compiled JavaScript could not be loaded");
      expect(output).toContain("Cannot find module");
      expect(output).not.toMatch(/\n\s*at\s+/);
    });

    it("fails cleanly when the compiled file has a missing import", () => {
      const { tsPath, jsPath } = writeTempFixture(
        tempDir,
        "bad-import",
        `
export const BadImportForm = true;
`,
        `
import "./missing-dependency.js";
import { formspec, field } from "@formspec/dsl";

export const BadImportForm = formspec(
  field.text("name", { label: "Name", required: true })
);
`
      );

      if (!jsPath) throw new Error("Expected compiled bad-import fixture");
      const result = runCli(["generate", tsPath, "--compiled", jsPath, "-o", tempDir]);
      const output = result.stdout + result.stderr;

      expect(result.exitCode).not.toBe(0);
      expect(output).toContain("Cannot find module");
      expect(output).toContain("missing-dependency.js");
      expect(output).not.toMatch(/\n\s*at\s+/);
    });

    it("surfaces module load failures before falling back for FormSpec-backed method params", () => {
      const { tsPath, jsPath } = writeTempFixture(
        tempDir,
        "method-params-load-failure",
        `
import type { InferFormSchema } from "@formspec/dsl";

declare const ActivateParams: unknown;

export class InstallmentPlan {
  activate(params: InferFormSchema<typeof ActivateParams>): { success: boolean } {
    return { success: Boolean(params) };
  }
}
`,
        `
import "./missing-method-params-dependency.js";
import { formspec, field } from "@formspec/dsl";

export const ActivateParams = formspec(
  field.number("amount", { label: "Amount (cents)", min: 100 })
);
`
      );

      if (!jsPath) throw new Error("Expected compiled method-params-load-failure fixture");
      const outDir = path.join(tempDir, "method-params-load-failure");
      const result = runCli(["generate", tsPath, "InstallmentPlan", "--compiled", jsPath, "-o", outDir]);
      const output = result.stdout + result.stderr;
      const runtimeLoadFailure = "Runtime FormSpec loading failed";
      const staticFallback = 'FormSpec export "ActivateParams" not found, using static analysis';

      expect(result.exitCode).toBe(0);
      expect(output).toContain(runtimeLoadFailure);
      expect(output).toContain("missing-method-params-dependency.js");
      expect(output).toContain(staticFallback);
      expect(output.indexOf(runtimeLoadFailure)).toBeLessThan(output.indexOf(staticFallback));
      expect(output).not.toMatch(/\n\s*at\s+/);
    });

    it("generates recursive schemas for circular references", () => {
      const fixturePath = resolveFixture("cli", "circular-node.ts");
      const outDir = path.join(tempDir, "circular-node");
      const result = runCli(["generate", fixturePath, "CircularNode", "-o", outDir]);
      const output = result.stdout + result.stderr;
      const schemaFile = findSchemaFile(outDir, "schema.json");

      expect(result.exitCode).toBe(0);
      expect(output).not.toMatch(/\n\s*at\s+/);
      expect(schemaFile).toBeDefined();
      if (!schemaFile) throw new Error("schema.json not found");

      const schema = readJson(schemaFile) as {
        type?: string;
        properties?: Record<string, { $ref?: string; type?: string }>;
        $defs?: Record<string, { properties?: Record<string, { $ref?: string }> }>;
      };
      expect(schema.type).toBe("object");
      expect(schema.properties?.next).toEqual({ $ref: "#/$defs/CircularNode" });
      expect(schema.$defs?.CircularNode?.properties?.next).toEqual({
        $ref: "#/$defs/CircularNode",
      });
    });
  });
});

function writeTempFixture(
  rootDir: string,
  name: string,
  tsSource: string,
  jsSource?: string
): { readonly tsPath: string; readonly jsPath: string | null } {
  const tsPath = path.join(rootDir, `${name}.ts`);
  fs.writeFileSync(tsPath, tsSource.trimStart());

  let jsPath: string | null = null;
  if (jsSource !== undefined) {
    jsPath = path.join(rootDir, `${name}.mjs`);
    fs.writeFileSync(jsPath, jsSource.trimStart());
  }

  return { tsPath, jsPath };
}

/** Recursively find all JSON files in a directory. */
function findAllJsonFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findAllJsonFiles(fullPath));
    } else if (entry.name.endsWith(".json")) {
      results.push(fullPath);
    }
  }
  return results;
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}
