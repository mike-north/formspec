/**
 * @see 003-json-schema-vocabulary.md §2.6: "Numeric constraint keywords: minimum, maximum,
 *   exclusiveMinimum, exclusiveMaximum, multipleOf"
 * @see 002-constraint-tags.md §3.2: "Constraint tag values are parsed as numbers"
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

describe("Exclusive Bound Edge Cases", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-exclusive-"));
    const fixturePath = resolveFixture("tsdoc-class", "exclusive-bound-edge-cases.ts");
    const result = runCli(["generate", fixturePath, "ExclusiveBoundsForm", "-o", tempDir]);
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

  it("emits the expected schema for all exclusive-bound permutations", () => {
    // @see 003-json-schema-vocabulary.md §2.6: root object schemas remain type: object
    expect(schema["type"]).toBe("object");
    // @see 003-json-schema-vocabulary.md §2.6: exclusiveMinimum/exclusiveMaximum emit as numeric keywords
    expect(properties["probability"]).toEqual({
      type: "number",
      exclusiveMinimum: 0,
      exclusiveMaximum: 1,
    });
    // @see 003-json-schema-vocabulary.md §2.6: a lone exclusiveMinimum is preserved
    expect(properties["temperature"]).toEqual({
      type: "number",
      exclusiveMinimum: -273.15,
    });
    // @see 003-json-schema-vocabulary.md §2.6: exclusive lower bound can be combined with inclusive maximum
    expect(properties["mixedLower"]).toEqual({
      type: "number",
      exclusiveMinimum: 0,
      maximum: 100,
    });
    // @see 003-json-schema-vocabulary.md §2.6: inclusive minimum can be combined with exclusive upper bound
    expect(properties["mixedUpper"]).toEqual({
      type: "number",
      minimum: 0,
      exclusiveMaximum: 1,
    });
  });

  it("marks every field required", () => {
    const required = schema["required"] as string[];
    expect(required).toHaveLength(4);
    expect(required).toEqual(
      expect.arrayContaining(["probability", "temperature", "mixedLower", "mixedUpper"])
    );
  });
});
