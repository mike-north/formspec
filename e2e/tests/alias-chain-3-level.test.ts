import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

describe("TSDoc Type Alias Chains", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-alias-chain-"));
    const fixturePath = resolveFixture("tsdoc-type-alias", "alias-chain-3-level.ts");
    const result = runCli(["generate", fixturePath, "AliasChainThreeLevelForm", "-o", tempDir]);
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

  it("composes three alias levels onto the generated field schema", () => {
    expect(properties["amount"]).toEqual({
      type: "number",
      minimum: 0,
      maximum: 1000,
      multipleOf: 5,
    });
  });

  it("keeps the field required", () => {
    expect(schema["required"]).toEqual(["amount"]);
  });
});
