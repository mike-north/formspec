/**
 * @see 003-json-schema-vocabulary.md — "T | null → { oneOf: [<T schema>, { type: null }] }"
 * @see 003-json-schema-vocabulary.md — "undefined → Not emitted (optionality via required, per S8)"
 * @see 003-json-schema-vocabulary.md — "String literal union → enum"
 */
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

describe("TSDoc Nullable Types", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-nullable-"));
    const fixturePath = resolveFixture("tsdoc-class", "nullable-types.ts");
    const result = runCli(["generate", fixturePath, "NullableForm", "-o", tempDir]);
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

  // 003: "T | null → { oneOf: [<T schema>, { type: null }] }"
  it("nickname (required, string | null) → oneOf[string, null]", () => {
    expect(properties["nickname"]["oneOf"]).toEqual([{ type: "string" }, { type: "null" }]);
    // Should NOT have a top-level type (oneOf is the constraint)
    expect(properties["nickname"]["type"]).toBeUndefined();
  });

  it("score (required, number | null) → oneOf[number, null]", () => {
    expect(properties["score"]["oneOf"]).toEqual([{ type: "number" }, { type: "null" }]);
    expect(properties["score"]["type"]).toBeUndefined();
  });

  // 003: "undefined → Not emitted (optionality is expressed via required, per S8)"
  it("age (optional number) → absent from required, has type number", () => {
    const required = schema["required"] as string[] | undefined;
    if (required) {
      expect(required).not.toContain("age");
    }
    expect(properties["age"]["type"]).toBe("number");
  });

  it("required fields: name, nickname, score, status — not age or tags", () => {
    const required = schema["required"] as string[];
    expect(required).toContain("name");
    expect(required).toContain("nickname");
    expect(required).toContain("score");
    expect(required).toContain("status");
    expect(required).not.toContain("age");
    expect(required).not.toContain("tags");
  });

  // 003: String literal union → enum
  it("status (string literal union) → enum", () => {
    expect(properties["status"]["enum"]).toEqual(expect.arrayContaining(["active", "inactive"]));
  });

  // 003 §2.4: "T[] → { type: array, items: <T schema> }"
  it("tags (optional string[]) → type array with string items", () => {
    expect(properties["tags"]["type"]).toBe("array");
    expect(properties["tags"]["items"]).toEqual({ type: "string" });
  });

  describe("Gold-master comparison", () => {
    const expectedDir = path.resolve(__dirname, "..", "expected", "tsdoc-class");

    it("matches expected JSON Schema", () => {
      expect(fs.existsSync(path.join(expectedDir, "nullable-types.schema.json"))).toBe(true);
      const schemaFile = findSchemaFile(tempDir, "schema.json");
      expect(schemaFile).toBeDefined();
      if (!schemaFile) throw new Error("Schema file not found");
      const actual = JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as unknown;
      const expected = loadExpected("tsdoc-class/nullable-types.schema.json");
      expect(actual).toEqual(expected);
    });

    it("matches expected UI Schema", () => {
      expect(fs.existsSync(path.join(expectedDir, "nullable-types.uischema.json"))).toBe(true);
      const uischemaFile = findSchemaFile(tempDir, "ux_spec.json");
      expect(uischemaFile).toBeDefined();
      if (!uischemaFile) throw new Error("UI schema file not found");
      const actual = JSON.parse(fs.readFileSync(uischemaFile, "utf-8")) as unknown;
      const expected = loadExpected("tsdoc-class/nullable-types.uischema.json");
      expect(actual).toEqual(expected);
    });
  });
});
