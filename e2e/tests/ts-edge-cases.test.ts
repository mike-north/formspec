/**
 * E2E coverage for TypeScript analyzer edge cases.
 *
 * Spec refs:
 * - 001-canonical-ir.md §2.5: object properties, additionalProperties, patternProperties
 * - 003-json-schema-vocabulary.md §2.1 and §2.5: primitive mappings, records, tuples, key families
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  runCli,
  resolveFixture,
  findSchemaFile,
} from "../helpers/schema-assertions.js";

/**
 * Generated E2E artifacts are untyped JSON; keep the cast at the boundary so
 * the assertions below can stay readable and spec-driven.
 */
function readJsonObject(filePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  expect(parsed).toEqual(expect.any(Object));
  return parsed as Record<string, unknown>;
}

function readJsonArrayField(
  object: Record<string, unknown>,
  key: string
): Record<string, unknown>[] {
  const parsed: unknown = object[key];
  expect(Array.isArray(parsed)).toBe(true);
  return parsed as Record<string, unknown>[];
}

function readDefinitions(schema: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const defs: unknown = schema["$defs"];
  expect(defs).toEqual(expect.any(Object));
  return defs as Record<string, Record<string, unknown>>;
}

describe("TSDoc Type Edge Cases", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let uiSchema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;
  let elements: Record<string, unknown>[];

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-ts-edge-"));
    const fixturePath = resolveFixture("tsdoc-class", "ts-edge-cases.ts");
    const result = runCli(["generate", fixturePath, "TsEdgeCaseForm", "-o", tempDir]);
    expect(result.exitCode).toBe(0);

    const schemaFile = findSchemaFile(tempDir, "schema.json");
    expect(schemaFile).toBeDefined();
    if (!schemaFile) throw new Error("Schema file not found");
    schema = readJsonObject(schemaFile);
    properties = schema["properties"] as Record<string, Record<string, unknown>>;

    const uiSchemaFile = findSchemaFile(tempDir, "ui_schema.json");
    expect(uiSchemaFile).toBeDefined();
    if (!uiSchemaFile) throw new Error("UI schema file not found");
    uiSchema = readJsonObject(uiSchemaFile);
    elements = readJsonArrayField(uiSchema, "elements");
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  function controlScopes(): string[] {
    return elements
      .filter((element) => element["type"] === "Control")
      .map((element) => String(element["scope"]));
  }

  function property(name: string): Record<string, unknown> {
    const prop = properties[name];
    expect(prop, `property "${name}" should exist`).toBeDefined();
    if (!prop) throw new Error(`property "${name}" missing`);
    return prop;
  }

  it("produces a root object schema with controls for public instance fields only", () => {
    expect(schema).toHaveProperty("type", "object");
    expect(uiSchema).toHaveProperty("type", "VerticalLayout");

    expect(properties).toHaveProperty("readOnlyTitle");
    expect(properties).toHaveProperty("contact");
    expect(properties).toHaveProperty("metadata");
    expect(properties).toHaveProperty("exactStates");
    expect(properties).toHaveProperty("patternEnvValues");
    expect(properties).toHaveProperty("coords");
    expect(properties).toHaveProperty("anyField");
    expect(properties).toHaveProperty("unknownField");
    expect(properties).toHaveProperty("neverField");
    expect(properties).toHaveProperty("voidField");

    expect(properties).not.toHaveProperty("secret");
    expect(properties).not.toHaveProperty("internal");
    expect(properties).not.toHaveProperty("version");

    expect(controlScopes()).toEqual(
      expect.arrayContaining([
        "#/properties/readOnlyTitle",
        "#/properties/contact",
        "#/properties/metadata",
        "#/properties/exactStates",
        "#/properties/patternEnvValues",
        "#/properties/coords",
        "#/properties/anyField",
        "#/properties/unknownField",
        "#/properties/neverField",
        "#/properties/voidField",
      ])
    );
    expect(controlScopes()).not.toContain("#/properties/secret");
    expect(controlScopes()).not.toContain("#/properties/internal");
    expect(controlScopes()).not.toContain("#/properties/version");
  });

  it("treats readonly members like ordinary properties", () => {
    expect(property("readOnlyTitle")).toEqual({ type: "string" });
  });

  it.skip("BUG: class inheritance is not yet included in derived class schemas", () => {
    expect(properties).toHaveProperty("baseId");
    expect(properties).toHaveProperty("baseLabel");
    expect(controlScopes()).toEqual(
      expect.arrayContaining(["#/properties/baseId", "#/properties/baseLabel"])
    );
  });

  it("expands nested interface inheritance into object properties", () => {
    const contact = property("contact");
    const defs = readDefinitions(schema);
    const extendedContact = defs["ExtendedContact"];

    expect(contact).toEqual({ $ref: "#/$defs/ExtendedContact" });
    expect(extendedContact).toMatchObject({
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
      },
    });
    expect(extendedContact["required"]).toEqual(expect.arrayContaining(["name", "email", "phone"]));
  });

  it("maps unconstrained records to additionalProperties", () => {
    expect(property("metadata")).toMatchObject({
      type: "object",
      additionalProperties: { type: "number" },
    });
  });

  it.skip("BUG: finite key unions are not yet emitted as explicit object properties", () => {
    const exactStates = property("exactStates");
    const defs = readDefinitions(schema);
    const recordDef = defs["Record"];

    expect(exactStates).toEqual({ $ref: "#/$defs/Record" });
    expect(recordDef).toMatchObject({
      type: "object",
      properties: {
        draft: { type: "string" },
        sent: { type: "string" },
      },
    });
    expect(recordDef["required"]).toEqual(expect.arrayContaining(["draft", "sent"]));
  });

  it.skip("BUG: tuple types are not yet emitted with prefixItems/items:false", () => {
    expect(property("coords")).toMatchObject({
      type: "array",
      prefixItems: [{ type: "number" }, { type: "number" }],
      items: false,
    });
  });

  it.skip("BUG: pattern-shaped key families are not yet emitted as patternProperties", () => {
    expect(property("patternEnvValues")).toMatchObject({
      type: "object",
      patternProperties: {
        "^env_": { type: "string" },
      },
    });
  });

  it.skip("BUG: any / unknown / never should map to the spec-defined top/bottom schemas", () => {
    expect(property("anyField")).toEqual({});
    expect(property("unknownField")).toEqual({});
    expect(property("neverField")).toEqual({ not: {} });
  });

  it.skip("BUG: void is not yet defined as a supported schema mapping", () => {
    expect(property("voidField")).toEqual({});
  });
});
