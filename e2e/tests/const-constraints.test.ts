/**
 * @see 003-json-schema-vocabulary.md §2.7: "@const → JSON Schema const"
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

describe("Const Constraints", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-const-"));
    const fixturePath = resolveFixture("tsdoc-class", "const-constraints.ts");
    const result = runCli(["generate", fixturePath, "ConstConstraintsForm", "-o", tempDir]);
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

  it('currency: @const "USD" → const: "USD"', () => {
    expect(properties["currency"]).toEqual({
      type: "string",
      const: "USD",
    });
  });

  it("statusCode: @const 200 → const: 200", () => {
    expect(properties["statusCode"]).toEqual({
      type: "number",
      const: 200,
    });
  });

  it("enabled: @const true → const: true", () => {
    expect(properties["enabled"]).toEqual({
      type: "boolean",
      const: true,
    });
  });

  it("all fields are required", () => {
    const required = schema["required"] as string[];
    expect(required).toEqual(expect.arrayContaining(["currency", "statusCode", "enabled"]));
  });
});
