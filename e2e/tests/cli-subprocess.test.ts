import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture } from "../helpers/schema-assertions.js";

describe("CLI Subprocess", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-cli-"));
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
      expect(result.stdout).toContain("generate");
      expect(result.stdout).toContain("--output");
    });
  });

  describe("error handling", () => {
    it("fails for non-existent file", () => {
      const result = runCli(["generate", "/tmp/does-not-exist-xyz.ts", "Foo", "-o", tempDir]);
      expect(result.exitCode).not.toBe(0);
    });

    it("fails for non-existent class name", () => {
      const fixturePath = resolveFixture("cli", "simple-order.ts");
      const result = runCli(["generate", fixturePath, "NonExistentClass", "-o", tempDir]);
      expect(result.exitCode).not.toBe(0);
      // Should mention the class wasn't found
      const output = result.stdout + result.stderr;
      expect(output).toContain("not found");
    });

    it("fails with unknown command", () => {
      const result = runCli(["bogus-command"]);
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe("class generation", () => {
    it("generates schemas for SimpleOrder class", () => {
      const outDir = path.join(tempDir, "simple-order-output");
      const fixturePath = resolveFixture("cli", "simple-order.ts");
      const result = runCli(["generate", fixturePath, "SimpleOrder", "-o", outDir]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("SimpleOrder");
      expect(result.stdout).toContain("Done!");

      // Verify output files exist
      expect(fs.existsSync(outDir)).toBe(true);
      const files = findAllJsonFiles(outDir);
      expect(files.length).toBeGreaterThan(0);

      // Verify schema content
      const schemaFile = files.find((f) => f.endsWith("schema.json"));
      expect(schemaFile).toBeDefined();
      if (!schemaFile) throw new Error("Schema file not found in CLI output");
      const schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as Record<string, unknown>;
      expect(schema).toHaveProperty("type", "object");
      expect(schema).toHaveProperty("properties");
    });
  });
});

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
