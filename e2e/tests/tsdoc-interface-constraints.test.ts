/**
 * Tests constraint extraction from class declarations used as interface-like
 * config shapes. Verifies @minimum, @maximum, @minLength, @maxLength, @pattern,
 * and @minItems tags produce correct JSON Schema output.
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
  assertPropertyConstraints,
} from "../helpers/schema-assertions.js";

describe("TSDoc Interface Constraints", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-iface-constraints-"));
    const fixturePath = resolveFixture("tsdoc-interface", "constrained-config.ts");
    const result = runCli(["generate", fixturePath, "ConstrainedConfig", "-o", tempDir]);
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

  describe("port field — @minimum 1 @maximum 65535", () => {
    it("has number type with minimum and maximum constraints", () => {
      assertPropertyConstraints(schema, "port", {
        type: "number",
        minimum: 1,
        maximum: 65535,
      });
    });
  });

  describe("hostname field — @minLength 1 @maxLength 253", () => {
    it("has string type with length constraints", () => {
      assertPropertyConstraints(schema, "hostname", {
        type: "string",
        minLength: 1,
        maxLength: 253,
      });
    });
  });

  describe("logLevel field — @pattern", () => {
    it("has string type with pattern constraint", () => {
      assertPropertyConstraints(schema, "logLevel", {
        type: "string",
        pattern: "^(debug|info|warn|error)$",
      });
    });
  });

  describe("timeoutMs field — @minimum 1000 @maximum 30000 (optional)", () => {
    it("has number type with range constraints", () => {
      assertPropertyConstraints(schema, "timeoutMs", {
        type: "number",
        minimum: 1000,
        maximum: 30000,
      });
    });

    it("is not in the required array (optional field)", () => {
      const required = schema["required"] as string[];
      expect(required).not.toContain("timeoutMs");
    });
  });

  describe("allowedOrigins field — @minItems 1", () => {
    it("has array type with minItems constraint", () => {
      assertPropertyConstraints(schema, "allowedOrigins", {
        type: "array",
        minItems: 1,
      });
    });

    it("has string item type", () => {
      expect(properties["allowedOrigins"]?.["items"]).toEqual({
        type: "string",
      });
    });
  });

  it("required fields exclude optional timeoutMs", () => {
    const required = schema["required"] as string[];
    expect(required).toContain("port");
    expect(required).toContain("hostname");
    expect(required).toContain("logLevel");
    expect(required).toContain("allowedOrigins");
    expect(required).not.toContain("timeoutMs");
  });

  describe("Gold-master comparison", () => {
    it("matches expected JSON Schema", () => {
      const expected = loadExpected("tsdoc-interface/constrained-config.schema.json");
      expect(schema).toEqual(expected);
    });

    it("matches expected UI Schema", () => {
      const uischemaFile = findSchemaFile(tempDir, "ui_schema.json");
      expect(uischemaFile).toBeDefined();
      if (!uischemaFile) throw new Error("UI Schema file not found");
      const actual = JSON.parse(fs.readFileSync(uischemaFile, "utf-8")) as unknown;
      const expected = loadExpected("tsdoc-interface/constrained-config.uischema.json");
      expect(actual).toEqual(expected);
    });
  });
});
