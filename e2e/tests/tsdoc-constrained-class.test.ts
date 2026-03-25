/**
 * Tests TSDoc comment tag extraction for constraint and annotation tags.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  runCli,
  resolveFixture,
  findSchemaFile,
  loadExpected,
} from "../helpers/schema-assertions.js";

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

  // V2: @displayName TSDoc tag is not currently mapped to title in schema output
  it("@displayName tag: name field has string type", () => {
    expect(properties["name"]?.["type"]).toBe("string");
  });

  // V2: @minimum/@maximum TSDoc tags are not currently emitted to JSON Schema
  it("@minimum/@maximum tag: age field has number type", () => {
    expect(properties["age"]?.["type"]).toBe("number");
  });

  // V2: @minLength/@maxLength/@pattern TSDoc tags are not currently emitted to JSON Schema
  it("@minLength/@maxLength/@pattern tag: email field has string type", () => {
    expect(properties["email"]?.["type"]).toBe("string");
  });

  // V2: @minItems/@maxItems TSDoc tags are not currently emitted to JSON Schema
  it("@minItems/@maxItems tag: tags field is an array type", () => {
    expect(properties["tags"]?.["type"]).toBe("array");
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
      const uischemaFile = findSchemaFile(tempDir, "ui_schema.json");
      expect(uischemaFile).toBeDefined();
      if (!uischemaFile) throw new Error("UI Schema file not found");
      const actual = JSON.parse(fs.readFileSync(uischemaFile, "utf-8")) as unknown;
      const expected = loadExpected("tsdoc-class/constrained-form.uischema.json");
      expect(actual).toEqual(expected);
    });
  });
});
