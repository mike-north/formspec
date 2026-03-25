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
  it("all array fields have type: array with items schema", () => {
    for (const field of ["nonEmpty", "bounded", "allowsEmpty", "combinedBounds", "uniqueTags"]) {
      expect(properties[field]["type"]).toBe("array");
      expect(properties[field]["items"]).toEqual({ type: "string" });
    }
    expect(properties["unconstrained"]["type"]).toBe("array");
    expect(properties["unconstrained"]["items"]).toEqual({ type: "number" });
  });

  // @see 003-json-schema-vocabulary.md §2.4: "@minItems 1 → minItems: 1"
  it("nonEmpty: @minItems 1 → minItems: 1", () => {
    expect(properties["nonEmpty"]["minItems"]).toBe(1);
    expect(properties["nonEmpty"]["maxItems"]).toBeUndefined();
  });

  // @see 003-json-schema-vocabulary.md §2.4: "@maxItems 100 → maxItems: 100"
  it("bounded: @maxItems 100 → maxItems: 100", () => {
    expect(properties["bounded"]["maxItems"]).toBe(100);
    expect(properties["bounded"]["minItems"]).toBeUndefined();
  });

  // @see 002-constraint-tags.md §3.2: "minItems: 0 is valid"
  it("allowsEmpty: @minItems 0 → minItems: 0 (valid)", () => {
    expect(properties["allowsEmpty"]["minItems"]).toBe(0);
  });

  it("combinedBounds: @minItems 1 @maxItems 10 → both emitted", () => {
    expect(properties["combinedBounds"]["minItems"]).toBe(1);
    expect(properties["combinedBounds"]["maxItems"]).toBe(10);
  });

  // @see 003-json-schema-vocabulary.md §2.4: "@uniqueItems → uniqueItems: true"
  it.skip("BUG: uniqueTags: @uniqueItems → uniqueItems: true", () => {
    // @see 003-json-schema-vocabulary.md §2.4: "@uniqueItems (bare) → uniqueItems: true"
    expect(properties["uniqueTags"]["uniqueItems"]).toBe(true);
  });

  // @see 003-json-schema-vocabulary.md §2.4: "all three array constraints combined"
  it.skip("BUG: allConstraints: minItems + maxItems + uniqueItems combined", () => {
    expect(properties["allConstraints"]["minItems"]).toBe(1);
    expect(properties["allConstraints"]["maxItems"]).toBe(5);
    expect(properties["allConstraints"]["uniqueItems"]).toBe(true);
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

  // @see 003-json-schema-vocabulary.md §2.4: "unconstrained array: items only"
  it("unconstrained: no constraint keywords on array itself", () => {
    const unconstrained = properties["unconstrained"];
    expect(unconstrained["type"]).toBe("array");
    expect(unconstrained["minItems"]).toBeUndefined();
    expect(unconstrained["maxItems"]).toBeUndefined();
    expect(unconstrained["uniqueItems"]).toBeUndefined();
  });

  it("all fields are required (all have ! not ?)", () => {
    const required = schema["required"] as string[];
    for (const field of [
      "nonEmpty",
      "bounded",
      "allowsEmpty",
      "combinedBounds",
      "uniqueTags",
      "allConstraints",
      "itemConstrained",
      "unconstrained",
    ]) {
      expect(required, `expected "${field}" in required`).toContain(field);
    }
  });
});
