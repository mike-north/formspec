/**
 * Tests @exclusiveMinimum, @exclusiveMaximum, @multipleOf (non-integer), and
 * @description annotation tags that were missing from E2E coverage.
 *
 * @see e2e/fixtures/tsdoc-class/extended-constraints.ts
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

describe("TSDoc Extended Constraints", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-extended-constraints-"));
    const fixturePath = resolveFixture("tsdoc-class", "extended-constraints.ts");
    const result = runCli(["generate", fixturePath, "ExtendedConstraints", "-o", tempDir]);
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

  describe("score field — @exclusiveMinimum 0 @exclusiveMaximum 100", () => {
    it("has number type", () => {
      expect(properties["score"]?.["type"]).toBe("number");
    });

    it("has exclusiveMinimum: 0", () => {
      expect(properties["score"]?.["exclusiveMinimum"]).toBe(0);
    });

    it("has exclusiveMaximum: 100", () => {
      expect(properties["score"]?.["exclusiveMaximum"]).toBe(100);
    });

    it("does not emit minimum or maximum (exclusive variants only)", () => {
      expect(properties["score"]?.["minimum"]).toBeUndefined();
      expect(properties["score"]?.["maximum"]).toBeUndefined();
    });
  });

  describe("quarterSteps field — @multipleOf 0.25 (non-integer)", () => {
    it("has number type (not integer — multipleOf is not 1)", () => {
      expect(properties["quarterSteps"]?.["type"]).toBe("number");
    });

    it("has multipleOf: 0.25", () => {
      expect(properties["quarterSteps"]?.["multipleOf"]).toBe(0.25);
    });
  });

  describe("notes field — @Field_description annotation", () => {
    it("has string type", () => {
      expect(properties["notes"]?.["type"]).toBe("string");
    });

    it("has description from @Field_description tag", () => {
      expect(properties["notes"]?.["description"]).toBe("A detailed description of this field");
    });
  });

  it("required fields are correct — score and quarterSteps required, notes optional", () => {
    const required = schema["required"] as string[];
    expect(required).toContain("score");
    expect(required).toContain("quarterSteps");
    expect(required).not.toContain("notes");
  });

  describe("Gold-master comparison", () => {
    it("matches expected JSON Schema", () => {
      const expected = loadExpected("tsdoc-class/extended-constraints.schema.json");
      expect(schema).toEqual(expected);
    });

    it("matches expected UI Schema", () => {
      const uischemaFile = findSchemaFile(tempDir, "ui_schema.json");
      expect(uischemaFile).toBeDefined();
      if (!uischemaFile) throw new Error("UI Schema file not found");
      const actual = JSON.parse(fs.readFileSync(uischemaFile, "utf-8")) as unknown;
      const expected = loadExpected("tsdoc-class/extended-constraints.uischema.json");
      expect(actual).toEqual(expected);
    });
  });
});
