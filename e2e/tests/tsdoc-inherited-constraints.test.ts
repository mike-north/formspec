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
    it("cpuUsage uses allOf with $ref to Percentage and field-level minimum override", () => {
      // cpuUsage has field-level @minimum 10, so: allOf[$ref Percentage, {minimum: 10}]
      const cpuUsage = properties["cpuUsage"];
      expect(cpuUsage?.["allOf"]).toBeDefined();
      const allOf = cpuUsage?.["allOf"] as Record<string, unknown>[] | undefined;
      expect(allOf?.some((item) => item["$ref"] === "#/$defs/Percentage")).toBe(true);
      expect(allOf?.some((item) => item["minimum"] === 10)).toBe(true);
    });

    it("cpuUsage field-level schema does not include maximum (inherited via $ref chain)", () => {
      // The maximum is not on the field schema itself — it is in $defs/Percentage
      const cpuUsage = properties["cpuUsage"];
      const allOf = cpuUsage?.["allOf"] as Record<string, unknown>[] | undefined;
      // None of the allOf items should have maximum — that comes from $defs/Percentage
      expect(
        allOf?.every((item) => item["maximum"] === undefined)
      ).toBe(true);
    });

    it("memoryUsage uses $ref to Percentage (no field-level constraints)", () => {
      expect(properties["memoryUsage"]?.["$ref"]).toBe("#/$defs/Percentage");
    });

    it("diskUsage (optional) uses $ref to Percentage", () => {
      expect(properties["diskUsage"]?.["$ref"]).toBe("#/$defs/Percentage");
    });

    it("$defs/Percentage uses allOf with $ref to Integer and min/max constraints", () => {
      const defs = schema["$defs"] as Record<string, Record<string, unknown>> | undefined;
      expect(defs).toBeDefined();
      const pctDef = defs?.["Percentage"];
      expect(pctDef?.["allOf"]).toBeDefined();
      const allOf = pctDef?.["allOf"] as Record<string, unknown>[] | undefined;
      expect(allOf?.some((item) => item["$ref"] === "#/$defs/Integer")).toBe(true);
      expect(
        allOf?.some(
          (item) => item["minimum"] === 0 && item["maximum"] === 100
        )
      ).toBe(true);
    });

    it("$defs/Integer has base type number with multipleOf 1", () => {
      const defs = schema["$defs"] as Record<string, Record<string, unknown>> | undefined;
      const intDef = defs?.["Integer"];
      expect(intDef?.["type"]).toBe("number");
      expect(intDef?.["multipleOf"]).toBe(1);
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
