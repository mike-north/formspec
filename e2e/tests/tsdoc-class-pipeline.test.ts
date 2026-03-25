import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

describe("TSDoc Class Pipeline", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-class-"));
    const fixturePath = resolveFixture("tsdoc-class", "product-form.ts");
    const result = runCli(["generate", fixturePath, "ProductForm", "-o", tempDir]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ProductForm");

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

  it("generated JSON Schema has correct properties", () => {
    expect(schema).toHaveProperty("type", "object");
    expect(properties).toHaveProperty("name");
    expect(properties).toHaveProperty("price");
    expect(properties).toHaveProperty("active");
  });

  it("marks required fields correctly", () => {
    const required = schema["required"] as string[];
    expect(required).toContain("name");
    expect(required).toContain("price");
    expect(required).toContain("active");
    expect(required).not.toContain("description");
    expect(required).not.toContain("tags");
  });

  it("handles string literal union as enum", () => {
    expect(properties["currency"]).toBeDefined();
    expect(properties["currency"]["enum"]).toEqual(expect.arrayContaining(["usd", "eur", "gbp"]));
  });
});
