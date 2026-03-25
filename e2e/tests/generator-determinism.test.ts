/**
 * Tests that the CLI generator produces byte-identical output on repeated runs.
 * Deterministic output is required for reproducible builds and reliable gold-master
 * comparisons.
 */
import { describe, it, expect, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

describe("Generator Determinism", () => {
  const tempDirs: string[] = [];

  afterAll(() => {
    for (const dir of tempDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
      }
    }
  });

  function makeTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  it("produces identical JSON Schema output on repeated runs", () => {
    const fixture = resolveFixture("tsdoc-class", "constrained-form.ts");

    const tempDir1 = makeTempDir("formspec-det-run1-");
    const result1 = runCli(["generate", fixture, "ConstrainedForm", "-o", tempDir1]);
    expect(result1.exitCode).toBe(0);
    const schemaFile1 = findSchemaFile(tempDir1, "schema.json");
    expect(schemaFile1).toBeDefined();
    if (!schemaFile1) throw new Error("Schema file not found in run 1");
    expect(path.basename(schemaFile1)).toBe("schema.json");
    const schema1 = fs.readFileSync(schemaFile1, "utf-8");

    const tempDir2 = makeTempDir("formspec-det-run2-");
    const result2 = runCli(["generate", fixture, "ConstrainedForm", "-o", tempDir2]);
    expect(result2.exitCode).toBe(0);
    const schemaFile2 = findSchemaFile(tempDir2, "schema.json");
    expect(schemaFile2).toBeDefined();
    if (!schemaFile2) throw new Error("Schema file not found in run 2");
    expect(path.basename(schemaFile2)).toBe("schema.json");
    const schema2 = fs.readFileSync(schemaFile2, "utf-8");

    expect(schema1).toBe(schema2);
  });

  it("produces identical UI Schema output on repeated runs", () => {
    const fixture = resolveFixture("tsdoc-class", "constrained-form.ts");

    const tempDir1 = makeTempDir("formspec-det-ui-run1-");
    const result1 = runCli(["generate", fixture, "ConstrainedForm", "-o", tempDir1]);
    expect(result1.exitCode).toBe(0);
    const uiFile1 = findSchemaFile(tempDir1, "ui_schema.json");
    expect(uiFile1).toBeDefined();
    if (!uiFile1) throw new Error("UI Schema file not found in run 1");
    const ui1 = fs.readFileSync(uiFile1, "utf-8");

    const tempDir2 = makeTempDir("formspec-det-ui-run2-");
    const result2 = runCli(["generate", fixture, "ConstrainedForm", "-o", tempDir2]);
    expect(result2.exitCode).toBe(0);
    const uiFile2 = findSchemaFile(tempDir2, "ui_schema.json");
    expect(uiFile2).toBeDefined();
    if (!uiFile2) throw new Error("UI Schema file not found in run 2");
    const ui2 = fs.readFileSync(uiFile2, "utf-8");

    expect(ui1).toBe(ui2);
  });

  it("produces identical output for interface-constraint fixture on repeated runs", () => {
    const fixture = resolveFixture("tsdoc-interface", "constrained-config.ts");

    const tempDir1 = makeTempDir("formspec-det-iface-run1-");
    const result1 = runCli(["generate", fixture, "ConstrainedConfig", "-o", tempDir1]);
    expect(result1.exitCode).toBe(0);
    const schemaFile1 = findSchemaFile(tempDir1, "schema.json");
    expect(schemaFile1).toBeDefined();
    if (!schemaFile1) throw new Error("Schema file not found in run 1");
    expect(path.basename(schemaFile1)).toBe("schema.json");
    const schema1 = fs.readFileSync(schemaFile1, "utf-8");

    const tempDir2 = makeTempDir("formspec-det-iface-run2-");
    const result2 = runCli(["generate", fixture, "ConstrainedConfig", "-o", tempDir2]);
    expect(result2.exitCode).toBe(0);
    const schemaFile2 = findSchemaFile(tempDir2, "schema.json");
    expect(schemaFile2).toBeDefined();
    if (!schemaFile2) throw new Error("Schema file not found in run 2");
    expect(path.basename(schemaFile2)).toBe("schema.json");
    const schema2 = fs.readFileSync(schemaFile2, "utf-8");

    expect(schema1).toBe(schema2);
  });
});
