import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  runCli,
  resolveFixture,
  findSchemaFile,
} from "../helpers/schema-assertions.js";

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

});
