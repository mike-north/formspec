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

describe("TSDoc Interface Pipeline", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-interface-"));
    const fixturePath = resolveFixture("tsdoc-interface", "server-config.ts");
    const result = runCli(["generate", fixturePath, "ServerConfig", "-o", tempDir]);
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
    expect(properties).toHaveProperty("hostname");
    expect(properties).toHaveProperty("port");
    expect(properties).toHaveProperty("protocol");
  });

  it("marks optional properties correctly", () => {
    const required = schema["required"] as string[];
    expect(required).toContain("hostname");
    expect(required).toContain("port");
    expect(required).not.toContain("maxConnections");
    expect(required).not.toContain("allowedOrigins");
  });

  it("handles protocol enum", () => {
    expect(properties["protocol"]).toBeDefined();
    expect(properties["protocol"]["enum"]).toEqual(expect.arrayContaining(["http", "https"]));
  });

  describe("Gold-master comparison", () => {
    const expectedDir = path.resolve(__dirname, "..", "expected", "tsdoc-interface");

    it("matches expected JSON Schema", () => {
      expect(fs.existsSync(path.join(expectedDir, "server-config.schema.json"))).toBe(true);
      const expected = loadExpected("tsdoc-interface/server-config.schema.json");
      expect(schema).toEqual(expected);
    });

    it("matches expected UI Schema", () => {
      expect(fs.existsSync(path.join(expectedDir, "server-config.uischema.json"))).toBe(true);
      const uischemaFile = findSchemaFile(tempDir, "ux_spec.json");
      expect(uischemaFile).toBeDefined();
      if (!uischemaFile) throw new Error("UI Schema file not found");
      const actual = JSON.parse(fs.readFileSync(uischemaFile, "utf-8")) as unknown;
      const expected = loadExpected("tsdoc-interface/server-config.uischema.json");
      expect(actual).toEqual(expected);
    });
  });
});
