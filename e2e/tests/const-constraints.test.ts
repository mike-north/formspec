/**
 * @see 002-tsdoc-grammar.md §4.1: "@const parses a JSON value"
 * @see 003-json-schema-vocabulary.md §2.2: literals map to const
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

describe("Annotation: @const", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-const-"));
    const fixturePath = resolveFixture("tsdoc-class", "const-constraints.ts");
    const result = runCli(["generate", fixturePath, "ConstForm", "-o", tempDir]);
    expect(result.exitCode).toBe(0);

    const schemaFile = findSchemaFile(tempDir, "schema.json");
    expect(schemaFile).toBeDefined();
    if (!schemaFile) throw new Error("Schema file not found");
    schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as Record<string, unknown>;
    properties = schema["properties"] as Record<string, Record<string, unknown>>;
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it("keeps the object schema shape", () => {
    expect(schema).toHaveProperty("type", "object");
    expect(properties).toHaveProperty("currency");
    expect(properties).toHaveProperty("magicNumber");
    expect(properties).toHaveProperty("alwaysTrue");
  });

  it.skip('BUG: currency @const "USD" emits const: "USD"', () => {
    const currency = properties["currency"];
    expect(currency).toBeDefined();
    if (!currency) return;
    expect(currency["const"]).toBe("USD");
  });

  it.skip("BUG: magicNumber @const 42 emits const: 42", () => {
    const magicNumber = properties["magicNumber"];
    expect(magicNumber).toBeDefined();
    if (!magicNumber) return;
    expect(magicNumber["const"]).toBe(42);
  });

  it.skip("BUG: alwaysTrue @const true emits const: true", () => {
    const alwaysTrue = properties["alwaysTrue"];
    expect(alwaysTrue).toBeDefined();
    if (!alwaysTrue) return;
    expect(alwaysTrue["const"]).toBe(true);
  });

  it("keeps all fields required", () => {
    const required = schema["required"] as string[];
    expect(required).toContain("currency");
    expect(required).toContain("magicNumber");
    expect(required).toContain("alwaysTrue");
  });
});
