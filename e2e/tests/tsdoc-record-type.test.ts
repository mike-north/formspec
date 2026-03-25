/**
 * Explicit assertions for Record<string, T> type mapping in generated schemas.
 *
 * The `product-form.ts` fixture has `metadata?: Record<string, string>`.
 * The generator emits a $ref to a shared $defs entry for the Record type.
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

describe("Record<string, T> Type Mapping", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;
  let defs: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-record-"));
    const fixturePath = resolveFixture("tsdoc-class", "product-form.ts");
    const result = runCli(["generate", fixturePath, "ProductForm", "-o", tempDir]);
    expect(result.exitCode).toBe(0);

    const schemaFile = findSchemaFile(tempDir, "schema.json");
    expect(schemaFile).toBeDefined();
    if (!schemaFile) throw new Error("Schema file not found");
    expect(path.basename(schemaFile)).toBe("schema.json");
    schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as Record<string, unknown>;
    properties = schema["properties"] as Record<string, Record<string, unknown>>;
    defs = schema["$defs"] as Record<string, Record<string, unknown>>;
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe("metadata property — Record<string, string>", () => {
    it("is present in schema properties", () => {
      expect(properties).toHaveProperty("metadata");
    });

    it("is not in the required array (optional field)", () => {
      const required = schema["required"] as string[];
      expect(required).not.toContain("metadata");
    });

    it("uses a $ref to a $defs entry", () => {
      expect(properties["metadata"]).toHaveProperty("$ref");
      const ref = properties["metadata"]?.["$ref"] as string;
      expect(ref).toMatch(/^#\/\$defs\//);
    });
  });

  describe("$defs Record entry", () => {
    it("schema has a $defs section", () => {
      expect(schema).toHaveProperty("$defs");
      expect(defs).toBeDefined();
    });

    it("Record def has type: object", () => {
      expect(defs["Record"]).toBeDefined();
      expect(defs["Record"]?.["type"]).toBe("object");
    });

    it("Record def has a properties field", () => {
      expect(defs["Record"]).toHaveProperty("properties");
    });

    it("Record def has additionalProperties: false", () => {
      // TODO: Record<string, string> should emit additionalProperties: { type: "string" }
      // Current behavior emits additionalProperties: false (value type T not reflected)
      expect(defs["Record"]?.["additionalProperties"]).toBe(false);
    });
  });

  describe("other ProductForm fields are unaffected", () => {
    it("name is a required string", () => {
      expect(properties["name"]?.["type"]).toBe("string");
      const required = schema["required"] as string[];
      expect(required).toContain("name");
    });

    it("price is a required number", () => {
      expect(properties["price"]?.["type"]).toBe("number");
      const required = schema["required"] as string[];
      expect(required).toContain("price");
    });

    it("tags is an optional string array", () => {
      expect(properties["tags"]?.["type"]).toBe("array");
      expect(properties["tags"]?.["items"]).toEqual({ type: "string" });
      const required = schema["required"] as string[];
      expect(required).not.toContain("tags");
    });
  });

  describe("Gold-master comparison", () => {
    it("matches expected JSON Schema", () => {
      const expected = loadExpected("tsdoc-class/product-form.schema.json");
      expect(schema).toEqual(expected);
    });
  });
});
