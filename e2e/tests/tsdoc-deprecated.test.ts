/**
 * Tests @deprecated tag extraction for both bare usage and with a message.
 *
 * JSON Schema 2020-12 represents deprecation as `"deprecated": true` (a boolean).
 * The deprecation message from the TSDoc tag is not preserved in JSON Schema output
 * as the spec has no standard field for it.
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

describe("TSDoc Deprecated Fields", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-deprecated-"));
    const fixturePath = resolveFixture("tsdoc-class", "deprecated-fields.ts");
    const result = runCli(["generate", fixturePath, "DeprecatedFields", "-o", tempDir]);
    expect(result.exitCode).toBe(0);

    const schemaFile = findSchemaFile(tempDir, "schema.json");
    expect(schemaFile).toBeDefined();
    if (!schemaFile) throw new Error("Schema file not found");
    expect(path.basename(schemaFile)).toBe("schema.json");
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

  describe("name field — non-deprecated required field", () => {
    it("has string type without deprecated flag", () => {
      expect(properties["name"]?.["type"]).toBe("string");
      expect(properties["name"]?.["deprecated"]).toBeUndefined();
    });

    it("is in the required array", () => {
      const required = schema["required"] as string[];
      expect(required).toContain("name");
    });
  });

  describe("oldField — bare @deprecated", () => {
    it("has string type with deprecated: true", () => {
      expect(properties["oldField"]?.["type"]).toBe("string");
      expect(properties["oldField"]?.["deprecated"]).toBe(true);
    });

    it("is not in the required array (optional field)", () => {
      const required = schema["required"] as string[];
      expect(required).not.toContain("oldField");
    });
  });

  describe("legacyName — @deprecated with message", () => {
    it("has string type with deprecated: true", () => {
      expect(properties["legacyName"]?.["type"]).toBe("string");
      expect(properties["legacyName"]?.["deprecated"]).toBe(true);
    });

    it("is not in the required array (optional field)", () => {
      const required = schema["required"] as string[];
      expect(required).not.toContain("legacyName");
    });

    // JSON Schema 2020-12 has no standard field for the deprecation message text.
    // The @deprecated tag with a message ("Use fullName instead") sets deprecated: true
    // but the message string is not preserved in the schema output.
    it.skip("not yet implemented: deprecation message text preserved in schema", () => {
      // If a future extension or x- annotation preserves the message, assert it here.
    });
  });

  it("required fields are correct", () => {
    const required = schema["required"] as string[];
    expect(required).toContain("name");
    expect(required).not.toContain("oldField");
    expect(required).not.toContain("legacyName");
  });

  describe("Gold-master comparison", () => {
    it("matches expected JSON Schema", () => {
      const expected = loadExpected("tsdoc-class/deprecated-fields.schema.json");
      expect(schema).toEqual(expected);
    });

    it("matches expected UI Schema", () => {
      const uischemaFile = findSchemaFile(tempDir, "ui_schema.json");
      expect(uischemaFile).toBeDefined();
      if (!uischemaFile) throw new Error("UI Schema file not found");
      const actual = JSON.parse(fs.readFileSync(uischemaFile, "utf-8")) as unknown;
      const expected = loadExpected("tsdoc-class/deprecated-fields.uischema.json");
      expect(actual).toEqual(expected);
    });
  });
});
