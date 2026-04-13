import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

describe("CLI", () => {
  let tempDir: string;
  const cliPath = path.join(__dirname, "..", "..", "dist", "cli.js");

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-cli-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  function runCli(args: string[]): { stdout: string; exitCode: number } {
    try {
      const stdout = execSync(`node ${cliPath} ${args.join(" ")}`, {
        encoding: "utf-8",
        cwd: tempDir,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return { stdout, exitCode: 0 };
    } catch (error) {
      const execError = error as { status: number; stdout: string; stderr: string };
      return {
        stdout: execError.stdout || execError.stderr || "",
        exitCode: execError.status || 1,
      };
    }
  }

  function createFormFile(filename: string, content: string): string {
    const filepath = path.join(tempDir, filename);
    fs.writeFileSync(filepath, content);
    return filepath;
  }

  describe("help", () => {
    it("should show help with --help flag", () => {
      const result = runCli(["--help"]);
      expect(result.stdout).toContain("FormSpec Build CLI");
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("--out-dir");
      expect(result.stdout).toContain("--enum-serialization");
      expect(result.stdout).toContain("--name");
    });

    it("should show help with -h flag", () => {
      const result = runCli(["-h"]);
      expect(result.stdout).toContain("FormSpec Build CLI");
    });
  });

  describe("argument parsing", () => {
    it("should fail when no input file provided", () => {
      const result = runCli([]);
      expect(result.exitCode).not.toBe(0);
      // Shows help which includes Usage information
      expect(result.stdout).toContain("Usage:");
    });

    it("should fail for unknown option", () => {
      const formFile = createFormFile(
        "form.js",
        `
        export default { elements: [] };
      `
      );
      const result = runCli([formFile, "--unknown-option"]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("Unknown option");
    });

    it("should fail when --out-dir has no value", () => {
      const formFile = createFormFile(
        "form.js",
        `
        export default { elements: [] };
      `
      );
      const result = runCli([formFile, "--out-dir"]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("--out-dir requires a value");
    });

    it("should fail when --name has no value", () => {
      const formFile = createFormFile(
        "form.js",
        `
        export default { elements: [] };
      `
      );
      const result = runCli([formFile, "--name"]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("--name requires a value");
    });

    it("should fail when --enum-serialization has no value", () => {
      const formFile = createFormFile(
        "form.js",
        `
        export default { elements: [] };
      `
      );
      const result = runCli([formFile, "--enum-serialization"]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("--enum-serialization requires a value");
    });

    it('should fail when --enum-serialization is not "enum" or "oneOf"', () => {
      const formFile = createFormFile(
        "form.js",
        `
        export default { elements: [] };
      `
      );
      const result = runCli([formFile, "--enum-serialization", "invalid"]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain('--enum-serialization must be "enum" or "oneOf"');
    });
  });

  describe("file handling", () => {
    it("should fail when input file doesn't exist", () => {
      const result = runCli(["nonexistent.js"]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("Error");
    });

    it("should fail when file has no form export", () => {
      const formFile = createFormFile(
        "no-export.js",
        `
        const notExported = { foo: "bar" };
      `
      );
      const result = runCli([formFile]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("Error");
    });

    it("should fail when export is not a FormSpec", () => {
      const formFile = createFormFile(
        "not-formspec.js",
        `
        export default { notAForm: true };
      `
      );
      const result = runCli([formFile]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toContain("FormSpec");
    });
  });

  describe("successful generation", () => {
    it("should generate schemas from default export", () => {
      const formFile = createFormFile(
        "form-default.js",
        `
        export default {
          elements: [
            { _type: "field", _field: "text", name: "name" }
          ]
        };
      `
      );

      const outDir = path.join(tempDir, "output");
      const result = runCli([formFile, "-o", outDir, "-n", "test"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Generated");
      expect(fs.existsSync(path.join(outDir, "test-schema.json"))).toBe(true);
      expect(fs.existsSync(path.join(outDir, "test-uischema.json"))).toBe(true);
    });

    it("should generate schemas from named 'form' export", () => {
      const formFile = createFormFile(
        "form-named.js",
        `
        export const form = {
          elements: [
            { _type: "field", _field: "text", name: "title" }
          ]
        };
      `
      );

      const outDir = path.join(tempDir, "output");
      const result = runCli([formFile, "-o", outDir, "-n", "test"]);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(path.join(outDir, "test-schema.json"))).toBe(true);
    });

    it("should derive name from input filename when not specified", () => {
      const formFile = createFormFile(
        "my-form.js",
        `
        export default {
          elements: [
            { _type: "field", _field: "text", name: "name" }
          ]
        };
      `
      );

      const outDir = path.join(tempDir, "output");
      const result = runCli([formFile, "-o", outDir]);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(path.join(outDir, "my-form-schema.json"))).toBe(true);
      expect(fs.existsSync(path.join(outDir, "my-form-uischema.json"))).toBe(true);
    });

    it("should use default output directory when not specified", () => {
      const formFile = createFormFile(
        "form.js",
        `
        export default {
          elements: [
            { _type: "field", _field: "text", name: "name" }
          ]
        };
      `
      );

      const result = runCli([formFile, "-n", "test"]);

      expect(result.exitCode).toBe(0);
      // Default output is ./generated relative to cwd
      expect(fs.existsSync(path.join(tempDir, "generated", "test-schema.json"))).toBe(true);
    });

    it("should accept short flags -o and -n", () => {
      const formFile = createFormFile(
        "form.js",
        `
        export default {
          elements: [
            { _type: "field", _field: "text", name: "name" }
          ]
        };
      `
      );

      const outDir = path.join(tempDir, "out");
      const result = runCli([formFile, "-o", outDir, "-n", "short"]);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(path.join(outDir, "short-schema.json"))).toBe(true);
    });

    it("should support oneOf enum serialization", () => {
      const formFile = createFormFile(
        "form-enum.js",
        `
        export default {
          elements: [
            {
              _type: "field",
              _field: "enum",
              name: "status",
              options: [
                { id: "draft", label: "Draft" },
                { id: "sent", label: "Sent to Customer" }
              ]
            }
          ]
        };
      `
      );

      const outDir = path.join(tempDir, "out-oneof");
      const result = runCli([formFile, "-o", outDir, "--enum-serialization", "oneOf"]);

      expect(result.exitCode).toBe(0);

      const schema = JSON.parse(
        fs.readFileSync(path.join(outDir, "form-enum-schema.json"), "utf-8")
      ) as Record<string, { oneOf?: unknown }>;
      const properties = schema["properties"] as Record<string, unknown>;

      expect(properties["status"]).toEqual({
        oneOf: [
          { const: "draft", title: "Draft" },
          { const: "sent", title: "Sent to Customer" },
        ],
      });
    });
  });
});
