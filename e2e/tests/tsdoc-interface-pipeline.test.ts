import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

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
});
