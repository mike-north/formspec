/**
 * Tests multiple constraints combined on a single field — verifying that all
 * three constraints coexist correctly in the JSON Schema output.
 *
 * Covers:
 * - Number field with @minimum + @maximum + @multipleOf
 * - String field with @minLength + @maxLength + @pattern
 * - Array field with @minItems + @maxItems
 *
 * @see e2e/fixtures/tsdoc-class/constraint-combinations.ts
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

describe("TSDoc Constraint Combinations", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-constraint-combinations-"));
    const fixturePath = resolveFixture("tsdoc-class", "constraint-combinations.ts");
    const result = runCli(["generate", fixturePath, "ConstraintCombinations", "-o", tempDir]);
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

  describe("roundedScore field — @minimum @maximum @multipleOf combined", () => {
    it("has number type", () => {
      expect(properties["roundedScore"]?.["type"]).toBe("number");
    });

    it("has minimum: 0", () => {
      expect(properties["roundedScore"]?.["minimum"]).toBe(0);
    });

    it("has maximum: 1000", () => {
      expect(properties["roundedScore"]?.["maximum"]).toBe(1000);
    });

    it("has multipleOf: 5", () => {
      expect(properties["roundedScore"]?.["multipleOf"]).toBe(5);
    });

    it("has all three constraints together", () => {
      expect(properties["roundedScore"]).toMatchObject({
        type: "number",
        minimum: 0,
        maximum: 1000,
        multipleOf: 5,
      });
    });
  });

  describe("username field — @minLength @maxLength @pattern combined", () => {
    it("has string type", () => {
      expect(properties["username"]?.["type"]).toBe("string");
    });

    it("has minLength: 3", () => {
      expect(properties["username"]?.["minLength"]).toBe(3);
    });

    it("has maxLength: 50", () => {
      expect(properties["username"]?.["maxLength"]).toBe(50);
    });

    it("has identifier pattern", () => {
      expect(properties["username"]?.["pattern"]).toBe("^[a-zA-Z][a-zA-Z0-9_]*$");
    });

    it("has all three constraints together", () => {
      expect(properties["username"]).toMatchObject({
        type: "string",
        minLength: 3,
        maxLength: 50,
        pattern: "^[a-zA-Z][a-zA-Z0-9_]*$",
      });
    });
  });

  describe("choices field — @minItems @maxItems combined on array", () => {
    it("has array type", () => {
      expect(properties["choices"]?.["type"]).toBe("array");
    });

    it("has string items", () => {
      expect(properties["choices"]?.["items"]).toEqual({ type: "string" });
    });

    it("has minItems: 1", () => {
      expect(properties["choices"]?.["minItems"]).toBe(1);
    });

    it("has maxItems: 5", () => {
      expect(properties["choices"]?.["maxItems"]).toBe(5);
    });

    it("has both array cardinality constraints together", () => {
      expect(properties["choices"]).toMatchObject({
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 5,
      });
    });
  });

  it("all fields are required", () => {
    const required = schema["required"] as string[];
    expect(required).toContain("roundedScore");
    expect(required).toContain("username");
    expect(required).toContain("choices");
  });

  describe("Gold-master comparison", () => {
    it("matches expected JSON Schema", () => {
      const expected = loadExpected("tsdoc-class/constraint-combinations.schema.json");
      expect(schema).toEqual(expected);
    });

    it("matches expected UI Schema", () => {
      const uischemaFile = findSchemaFile(tempDir, "ui_schema.json");
      expect(uischemaFile).toBeDefined();
      if (!uischemaFile) throw new Error("UI Schema file not found");
      const actual = JSON.parse(fs.readFileSync(uischemaFile, "utf-8")) as unknown;
      const expected = loadExpected("tsdoc-class/constraint-combinations.uischema.json");
      expect(actual).toEqual(expected);
    });
  });
});
