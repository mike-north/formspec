/**
 * Tests type alias constraint inheritance in TSDoc-annotated classes.
 *
 * Verifies that constraints defined on type aliases propagate to fields
 * that use those types, with field-level constraints taking precedence
 * for scalar bounds (minimum, maximum, etc.).
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

describe("TSDoc Inherited Constraints", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let uischema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;
  let elements: Record<string, unknown>[];

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-inherited-"));
    const fixturePath = resolveFixture("tsdoc-class", "inherited-constraints.ts");
    const result = runCli(["generate", fixturePath, "MetricsForm", "-o", tempDir]);
    expect(result.exitCode).toBe(0);

    const schemaFile = findSchemaFile(tempDir, "schema.json");
    expect(schemaFile).toBeDefined();
    if (!schemaFile) throw new Error("Schema file not found");
    schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as Record<string, unknown>;
    properties = schema["properties"] as Record<string, Record<string, unknown>>;

    const uischemaFile = findSchemaFile(tempDir, "ux_spec.json");
    expect(uischemaFile).toBeDefined();
    if (!uischemaFile) throw new Error("UI Schema file not found");
    uischema = JSON.parse(fs.readFileSync(uischemaFile, "utf-8")) as Record<string, unknown>;
    elements = uischema["elements"] as Record<string, unknown>[];
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe("JSON Schema — constraint inheritance", () => {
    it("cpuUsage inherits maximum from Percentage, minimum is overridden by field tag", () => {
      // Percentage has @minimum 0 @maximum 100, field has @minimum 10
      // Result: minimum = max(0, 10) = 10, maximum = 100
      expect(properties["cpuUsage"]?.["minimum"]).toBe(10);
      expect(properties["cpuUsage"]?.["maximum"]).toBe(100);
    });

    it("cpuUsage inherits multipleOf from Integer via Percentage chain", () => {
      expect(properties["cpuUsage"]?.["multipleOf"]).toBe(1);
    });

    it("memoryUsage inherits all constraints from Percentage and Integer", () => {
      expect(properties["memoryUsage"]?.["minimum"]).toBe(0);
      expect(properties["memoryUsage"]?.["maximum"]).toBe(100);
      expect(properties["memoryUsage"]?.["multipleOf"]).toBe(1);
    });

    it("diskUsage (optional) inherits all constraints from Percentage and Integer", () => {
      expect(properties["diskUsage"]?.["minimum"]).toBe(0);
      expect(properties["diskUsage"]?.["maximum"]).toBe(100);
      expect(properties["diskUsage"]?.["multipleOf"]).toBe(1);
    });

    it("required contains only the non-optional fields", () => {
      const required = schema["required"] as string[];
      expect(required).toContain("cpuUsage");
      expect(required).toContain("memoryUsage");
      expect(required).not.toContain("diskUsage");
    });
  });

  describe("UI Schema — constraint inheritance", () => {
    it("cpuUsage UI element has overridden min and inherited max", () => {
      const el = elements.find((e) => e["id"] === "cpuUsage");
      expect(el?.["min"]).toBe(10);
      expect(el?.["max"]).toBe(100);
    });

    it("memoryUsage UI element has inherited min and max", () => {
      const el = elements.find((e) => e["id"] === "memoryUsage");
      expect(el?.["min"]).toBe(0);
      expect(el?.["max"]).toBe(100);
    });

    it("diskUsage UI element has inherited min and max", () => {
      const el = elements.find((e) => e["id"] === "diskUsage");
      expect(el?.["min"]).toBe(0);
      expect(el?.["max"]).toBe(100);
    });
  });

  describe("Gold-master comparison", () => {
    it("matches expected JSON Schema", () => {
      const expected = loadExpected("tsdoc-class/inherited-constraints.schema.json");
      expect(schema).toEqual(expected);
    });

    it("matches expected UI Schema", () => {
      const expected = loadExpected("tsdoc-class/inherited-constraints.uischema.json");
      expect(uischema).toEqual(expected);
    });
  });
});
