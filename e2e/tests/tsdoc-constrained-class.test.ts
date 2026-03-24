/**
 * Tests TSDoc comment tag extraction for constraint and annotation tags.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import {
  runCli,
  resolveFixture,
  findSchemaFile,
  loadExpected,
} from "../helpers/schema-assertions.js";

const _dirname = path.dirname(fileURLToPath(import.meta.url));

describe("TSDoc Constrained Class", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-constrained-"));
    const fixturePath = resolveFixture("tsdoc-class", "constrained-form.ts");
    const result = runCli(["generate", fixturePath, "ConstrainedForm", "-o", tempDir]);
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

  it("has correct schema structure", () => {
    expect(schema).toHaveProperty("type", "object");
    expect(schema).toHaveProperty("properties");
  });

  it("@displayName maps to title", () => {
    expect(properties["name"]?.["title"]).toBe("Full Name");
  });

  it("@minimum/@maximum on number field", () => {
    expect(properties["age"]?.["minimum"]).toBe(0);
    expect(properties["age"]?.["maximum"]).toBe(150);
  });

  it("@minLength/@maxLength/@pattern on string field", () => {
    expect(properties["email"]?.["minLength"]).toBe(5);
    expect(properties["email"]?.["maxLength"]).toBe(100);
    expect(properties["email"]?.["pattern"]).toBe("^[^@]+@[^@]+$");
  });

  it("@minItems/@maxItems on array field", () => {
    expect(properties["tags"]?.["minItems"]).toBe(1);
    expect(properties["tags"]?.["maxItems"]).toBe(10);
  });

  it("@deprecated on optional field", () => {
    expect(properties["legacyField"]?.["deprecated"]).toBe(true);
  });

  it("required fields are correct", () => {
    const required = schema["required"] as string[];
    expect(required).toContain("name");
    expect(required).toContain("age");
    expect(required).toContain("email");
    expect(required).toContain("tags");
    expect(required).not.toContain("legacyField");
  });

  describe("Gold-master comparison", () => {
    it("matches expected JSON Schema", () => {
      const expected = loadExpected("tsdoc-class/constrained-form.schema.json");
      expect(schema).toEqual(expected);
    });

    it("matches expected UI Schema", () => {
      const uischemaFile = findSchemaFile(tempDir, "ux_spec.json");
      expect(uischemaFile).toBeDefined();
      if (!uischemaFile) throw new Error("UI Schema file not found");
      const actual = JSON.parse(fs.readFileSync(uischemaFile, "utf-8")) as unknown;
      const expected = loadExpected("tsdoc-class/constrained-form.uischema.json");
      expect(actual).toEqual(expected);
    });
  });
});
