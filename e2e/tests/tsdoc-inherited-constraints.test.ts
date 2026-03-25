/**
 * Tests fields typed with constrained type aliases in TSDoc-annotated classes.
 *
 * The current V2 pipeline resolves aliases to their base types but does not
 * propagate TSDoc constraints from type alias declarations. Fields typed to
 * Percentage or Integer aliases receive only `type: "number"` in the output.
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

    const uischemaFile = findSchemaFile(tempDir, "ui_schema.json");
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

  // V2: type alias TSDoc constraints and inheritance are not processed —
  // fields typed to Percentage/Integer aliases all receive base type: number
  describe("JSON Schema — constraint inheritance", () => {
    it("cpuUsage field has type number (base type of Percentage alias)", () => {
      expect(properties["cpuUsage"]?.["type"]).toBe("number");
    });

    it("memoryUsage field has type number (base type of Percentage alias)", () => {
      expect(properties["memoryUsage"]?.["type"]).toBe("number");
    });

    it("diskUsage field has type number (base type of Percentage alias)", () => {
      expect(properties["diskUsage"]?.["type"]).toBe("number");
    });

    it("required contains only the non-optional fields", () => {
      const required = schema["required"] as string[];
      expect(required).toContain("cpuUsage");
      expect(required).toContain("memoryUsage");
      expect(required).not.toContain("diskUsage");
    });
  });

  // V2: UI elements render as plain Controls without min/max attributes
  describe("UI Schema — constraint inheritance", () => {
    it("cpuUsage UI element is a Control", () => {
      const el = elements.find((e) => e["scope"] === "#/properties/cpuUsage");
      expect(el).toBeDefined();
      expect(el?.["type"]).toBe("Control");
    });

    it("memoryUsage UI element is a Control", () => {
      const el = elements.find((e) => e["scope"] === "#/properties/memoryUsage");
      expect(el).toBeDefined();
      expect(el?.["type"]).toBe("Control");
    });

    it("diskUsage UI element is a Control", () => {
      const el = elements.find((e) => e["scope"] === "#/properties/diskUsage");
      expect(el).toBeDefined();
      expect(el?.["type"]).toBe("Control");
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
