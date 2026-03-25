import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import {
  runCli,
  resolveFixture,
  findSchemaFile,
  loadExpected,
} from "../helpers/schema-assertions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("TSDoc Type Alias Pipeline", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-typealias-"));
    const fixturePath = resolveFixture("tsdoc-type-alias", "constrained-types.ts");
    const result = runCli(["generate", fixturePath, "NetworkConfig", "-o", tempDir]);
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

  it("generated schema has correct properties", () => {
    expect(schema).toHaveProperty("type", "object");
    expect(properties).toHaveProperty("cpuThreshold");
    expect(properties).toHaveProperty("adminEmail");
    expect(properties).toHaveProperty("enableAlerts");
  });

  it("number fields have number type", () => {
    expect(properties["cpuThreshold"]["type"]).toBe("number");
    expect(properties["memoryThreshold"]["type"]).toBe("number");
  });

  it("boolean field has boolean type", () => {
    expect(properties["enableAlerts"]["type"]).toBe("boolean");
  });

  describe("Gold-master comparison", () => {
    const expectedDir = path.resolve(__dirname, "..", "expected", "tsdoc-type-alias");

    it("matches expected JSON Schema", () => {
      expect(fs.existsSync(path.join(expectedDir, "constrained-types.schema.json"))).toBe(true);
      const expected = loadExpected("tsdoc-type-alias/constrained-types.schema.json");
      expect(schema).toEqual(expected);
    });

    it("matches expected UI Schema", () => {
      expect(fs.existsSync(path.join(expectedDir, "constrained-types.uischema.json"))).toBe(true);
      const uischemaFile = findSchemaFile(tempDir, "ui_schema.json");
      expect(uischemaFile).toBeDefined();
      if (!uischemaFile) throw new Error("UI Schema file not found");
      const actual = JSON.parse(fs.readFileSync(uischemaFile, "utf-8")) as unknown;
      const expected = loadExpected("tsdoc-type-alias/constrained-types.uischema.json");
      expect(actual).toEqual(expected);
    });
  });
});
