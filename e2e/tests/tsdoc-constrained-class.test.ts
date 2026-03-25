/**
 * Tests TSDoc comment tag extraction for constraint and annotation tags.
 *
 * Constraint tags use lowercase/camelCase names matching JSON Schema keywords:
 * `@minimum`, `@maximum`, `@minLength`, `@maxLength`, `@pattern`,
 * `@minItems`, `@maxItems`, `@deprecated`.
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

  describe("name field — @displayName annotation", () => {
    it("has string type", () => {
      expect(properties["name"]?.["type"]).toBe("string");
    });

    it("emits title from @displayName", () => {
      expect(properties["name"]?.["title"]).toBe("Full Name");
    });
  });

  describe("age field — @minimum 0 @maximum 150", () => {
    it("has number type with minimum and maximum constraints", () => {
      expect(properties["age"]?.["type"]).toBe("number");
      expect(properties["age"]?.["minimum"]).toBe(0);
      expect(properties["age"]?.["maximum"]).toBe(150);
    });
  });

  describe("email field — @minLength 5 @maxLength 100 @pattern", () => {
    it("has string type with length and pattern constraints", () => {
      expect(properties["email"]?.["type"]).toBe("string");
      expect(properties["email"]?.["minLength"]).toBe(5);
      expect(properties["email"]?.["maxLength"]).toBe(100);
      expect(properties["email"]?.["pattern"]).toBe("^[^@]+@[^@]+$");
    });
  });

  describe("tags field — @minItems 1 @maxItems 10", () => {
    it("has array type with item cardinality constraints", () => {
      expect(properties["tags"]?.["type"]).toBe("array");
      expect(properties["tags"]?.["items"]).toEqual({ type: "string" });
      expect(properties["tags"]?.["minItems"]).toBe(1);
      expect(properties["tags"]?.["maxItems"]).toBe(10);
    });
  });

  describe("legacyField — @deprecated", () => {
    it("has string type with deprecated flag", () => {
      expect(properties["legacyField"]?.["type"]).toBe("string");
      expect(properties["legacyField"]?.["deprecated"]).toBe(true);
    });
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
