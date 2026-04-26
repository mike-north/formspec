/**
 * @see 003-json-schema-vocabulary.md §2.1: primitive TypeScript types map to JSON Schema primitives
 * @see 003-json-schema-vocabulary.md §2.3: `T | null` emits `oneOf`
 * @see 003-json-schema-vocabulary.md §2.4: arrays emit `type: "array"` with `items`
 * @see 003-json-schema-vocabulary.md §2.5: ordinary objects omit `additionalProperties`; unconstrained records use `additionalProperties`
 * @see 003-json-schema-vocabulary.md §5.1: named object types use `$defs`/`$ref`
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

describe("Type Mappings — comprehensive", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;
  let defs: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-type-mappings-"));
    const fixturePath = resolveFixture("tsdoc-class", "type-mappings-comprehensive.ts");
    const result = runCli(["generate", fixturePath, "TypeMappingsForm", "-o", tempDir]);
    expect(result.exitCode).toBe(0);

    const schemaFile = findSchemaFile(tempDir, "schema.json");
    expect(schemaFile).toBeDefined();
    if (!schemaFile) throw new Error("Schema file not found");

    schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as Record<string, unknown>;
    properties = schema["properties"] as Record<string, Record<string, unknown>>;

    expect(schema).toHaveProperty("$defs");
    defs = schema["$defs"] as Record<string, Record<string, unknown>>;
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it("maps primitive fields directly to JSON Schema primitives", () => {
    expect(properties["stringField"]).toEqual({ type: "string" });
    expect(properties["numberField"]).toEqual({ type: "number" });
    expect(properties["booleanField"]).toEqual({ type: "boolean" });
  });

  it("emits oneOf for nullable primitives", () => {
    expect(properties["nullableString"]).toEqual({
      oneOf: [{ type: "string" }, { type: "null" }],
    });
    expect(properties["nullableNumber"]).toEqual({
      oneOf: [{ type: "number" }, { type: "null" }],
    });
  });

  it("keeps optional fields out of required while preserving their base type", () => {
    expect(properties["optionalString"]).toEqual({ type: "string" });
    expect(properties["optionalNumber"]).toEqual({ type: "number" });

    const required = schema["required"] as string[];
    expect(required).toContain("stringField");
    expect(required).toContain("numberField");
    expect(required).toContain("booleanField");
    expect(required).toContain("nullableString");
    expect(required).toContain("nullableNumber");
    expect(required).toContain("stringLiteralUnion");
    expect(required).toContain("numberArray");
    expect(required).toContain("stringArray");
    expect(required).toContain("inlineObject");
    expect(required).toContain("namedType");
    expect(required).toContain("recordType");
    expect(required).not.toContain("optionalString");
    expect(required).not.toContain("optionalNumber");
    expect(required).not.toContain("namedTypeOptional");
  });

  it("maps literal unions and arrays to enum and items schemas", () => {
    expect(properties["stringLiteralUnion"]).toEqual({ enum: ["a", "b", "c"] });
    expect(properties["numberArray"]).toEqual({
      type: "array",
      items: { type: "number" },
    });
    expect(properties["stringArray"]).toEqual({
      type: "array",
      items: { type: "string" },
    });
  });

  it("omits additionalProperties for inline object types", () => {
    expect(properties["inlineObject"]).toEqual({
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
      },
      required: ["x", "y"],
    });
  });

  it("uses $defs/$ref for named object types without forcing additionalProperties false", () => {
    expect(properties["namedType"]).toEqual({ $ref: "#/$defs/Address" });
    expect(properties["namedTypeOptional"]).toEqual({ $ref: "#/$defs/Address" });
    expect(defs["Address"]).toEqual({
      type: "object",
      properties: {
        street: { type: "string" },
        city: { type: "string" },
        country: { type: "string" },
      },
      required: ["city", "country", "street"],
    });
  });

  it("maps Record<string, number> to additionalProperties", () => {
    expect(properties["recordType"]).toEqual({
      type: "object",
      additionalProperties: { type: "number" },
    });
  });
});
