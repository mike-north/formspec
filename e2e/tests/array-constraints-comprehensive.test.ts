/**
 * @see 003-json-schema-vocabulary.md §2.4: "Array constraint keywords: minItems, maxItems, uniqueItems"
 * @see 002-constraint-tags.md §4.3: "Item-level constraints on primitive arrays — applies to items schema"
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

describe("Array Constraints — comprehensive", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-array-"));
    const fixturePath = resolveFixture("tsdoc-class", "array-constraints-comprehensive.ts");
    const result = runCli(["generate", fixturePath, "ArrayConstraintsForm", "-o", tempDir]);
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

  // @see 003-json-schema-vocabulary.md §2.4: "T[] → { type: array, items: <T schema> }"
  it("nonEmpty: string[] → array of strings", () => {
    expect(properties["nonEmpty"]).toEqual({
      type: "array",
      items: { type: "string" },
      minItems: 1,
    });
  });

  it("bounded: string[] → array of strings", () => {
    expect(properties["bounded"]).toEqual({
      type: "array",
      items: { type: "string" },
      maxItems: 100,
    });
  });

  it("allowsEmpty: string[] → array of strings", () => {
    expect(properties["allowsEmpty"]).toEqual({
      type: "array",
      items: { type: "string" },
      minItems: 0,
    });
  });

  it("combinedBounds: string[] → array of strings with both bounds", () => {
    expect(properties["combinedBounds"]).toEqual({
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 10,
    });
  });

  it.skip("BUG: uniqueTags: string[] → array of strings with uniqueItems", () => {
    expect(properties["uniqueTags"]).toEqual({
      type: "array",
      items: { type: "string" },
      uniqueItems: true,
    });
  });

  it.skip("BUG: allConstraints: string[] → array of strings with minItems, maxItems, and uniqueItems", () => {
    expect(properties["allConstraints"]).toEqual({
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 5,
      uniqueItems: true,
    });
  });

  it("unconstrained: number[] → array of numbers", () => {
    expect(properties["unconstrained"]).toEqual({
      type: "array",
      items: { type: "number" },
    });
  });

  // @see 002-constraint-tags.md §4.3: "string constraint on string[] → applied to items schema, not array"
  it.skip("BUG: itemConstrained: @maxLength 50 on string[] → applies to items, not array", () => {
    // @see 002-constraint-tags.md §4.3: "item-level string constraint on primitive array → items.maxLength"
    const itemConstrained = properties["itemConstrained"];
    expect(itemConstrained["type"]).toBe("array");
    // maxLength must NOT be on the array itself
    expect(itemConstrained["maxLength"]).toBeUndefined();
    // maxLength must be on items schema
    const items = itemConstrained["items"] as Record<string, unknown>;
    expect(items).toBeDefined();
    expect(items["maxLength"]).toBe(50);
    expect(items["type"]).toBe("string");
  });

  it("all fields are required (all have ! not ?)", () => {
    const required = schema["required"] as string[];
    expect(required).toEqual([
      "nonEmpty",
      "bounded",
      "allowsEmpty",
      "combinedBounds",
      "uniqueTags",
      "allConstraints",
      "itemConstrained",
      "unconstrained",
    ]);
  });
});
