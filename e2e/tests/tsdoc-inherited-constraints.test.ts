/**
 * Tests fields typed with constrained type aliases in TSDoc-annotated classes.
 *
 * Verifies that constraints declared on type aliases (e.g., `@minimum 0`
 * on `Percentage`) propagate transitively to fields. The alias chain
 * `Integer` → `Percentage` → field means fields typed as `Percentage`
 * inherit constraints from both `Percentage` AND `Integer`.
 *
 * Special case: `@multipleOf 1` on a number type promotes it to
 * `type: "integer"` in JSON Schema (the `multipleOf` keyword is suppressed
 * because `integer` is a subtype of `number` that implies it).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

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

  describe("JSON Schema — transitive constraint inheritance", () => {
    // Integer (@multipleOf 1) → Percentage (@minimum 0 @maximum 100) → fields
    // multipleOf:1 on number promotes type to "integer" (keyword suppressed)

    it("cpuUsage: field-level @minimum overrides alias, inherits Integer → integer type", () => {
      // Integer's @multipleOf 1 propagates transitively → type promoted to "integer"
      expect(properties["cpuUsage"]?.["type"]).toBe("integer");
      // Field-level @minimum 10 overrides Percentage's @minimum 0
      expect(properties["cpuUsage"]?.["minimum"]).toBe(10);
      // Inherited from Percentage alias: @maximum 100
      expect(properties["cpuUsage"]?.["maximum"]).toBe(100);
    });

    it("memoryUsage: inherits full Percentage + Integer constraint chain", () => {
      expect(properties["memoryUsage"]?.["type"]).toBe("integer");
      expect(properties["memoryUsage"]?.["minimum"]).toBe(0);
      expect(properties["memoryUsage"]?.["maximum"]).toBe(100);
    });

    it("diskUsage (optional): same constraints as memoryUsage", () => {
      expect(properties["diskUsage"]?.["type"]).toBe("integer");
      expect(properties["diskUsage"]?.["minimum"]).toBe(0);
      expect(properties["diskUsage"]?.["maximum"]).toBe(100);
    });

    it("required contains only the non-optional fields", () => {
      const required = schema["required"] as string[];
      expect(required).toContain("cpuUsage");
      expect(required).toContain("memoryUsage");
      expect(required).not.toContain("diskUsage");
    });
  });

  describe("UI Schema — controls", () => {
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
});
