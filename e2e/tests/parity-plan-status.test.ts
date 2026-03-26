/**
 * @see 003-json-schema-vocabulary.md §2.3: enum member metadata uses oneOf/const/title
 * @see 003-json-schema-vocabulary.md §2.8: class/type-level display names and default values
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

describe("Parity: plan status annotations", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-plan-status-"));
    const fixturePath = resolveFixture("tsdoc-class", "parity-plan-status.ts");
    const result = runCli(["generate", fixturePath, "Subscription", "-o", tempDir]);
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

  it("keeps the field in the object schema", () => {
    expect(properties).toHaveProperty("status");
    const required = schema["required"] as string[];
    expect(required).toContain("status");
  });

  it.skip("BUG: PlanStatus type-level @displayName emits a root title in $defs", () => {
    const defs = schema["$defs"] as Record<string, Record<string, unknown>> | undefined;
    expect(defs?.["PlanStatus"]?.["title"]).toBe("Plan Status");
  });

  it.skip("BUG: PlanStatus member labels emit oneOf with const/title entries", () => {
    const defs = schema["$defs"] as Record<string, Record<string, unknown>> | undefined;
    expect(defs?.["PlanStatus"]?.["oneOf"]).toEqual([
        { const: "active", title: "Active" },
        { const: "paused", title: "Paused" },
        { const: "cancelled", title: "Cancelled" },
      ]);
  });

  it.skip("BUG: status @defaultValue emits default: \"active\"", () => {
    const status = properties["status"];
    expect(status).toBeDefined();
    if (!status) return;
    expect(status["default"]).toBe("active");
  });
});
