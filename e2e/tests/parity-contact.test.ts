/**
 * TSDoc ↔ Chain DSL Parity Test: Contact Form
 *
 * Verifies that the TSDoc surface and chain DSL surface produce structurally
 * equivalent JSON Schema output for the same form intent. The comparison focuses
 * on constraint/structural properties (`type`, `minimum`, `maximum`, `minLength`,
 * `maxLength`, `pattern`, `enum`, `required`) and deliberately excludes
 * surface-specific annotations like `title` (which chain DSL sets via `label`
 * and TSDoc sets via `@displayName`).
 *
 * @see e2e/fixtures/tsdoc-class/parity-contact.ts — TSDoc surface
 * @see e2e/fixtures/chain-dsl/parity-contact.ts — Chain DSL surface
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { buildFormSchemas } from "@formspec/build";
import { ParityContact as ParityContactDSL } from "../fixtures/chain-dsl/parity-contact.js";
import {
  runCli,
  resolveFixture,
  findSchemaFile,
  loadExpected,
} from "../helpers/schema-assertions.js";

/**
 * Structural/constraint properties to compare between surfaces.
 * Excludes surface-specific annotations (title, description, etc.)
 * that only one surface may set.
 */
const STRUCTURAL_KEYS = [
  "type",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "enum",
  "items",
  "minItems",
  "maxItems",
] as const;

/**
 * Extracts only structural/constraint fields from a property schema.
 * Strips annotation fields like `title` and `description`.
 */
function extractStructural(
  propSchema: Record<string, unknown>
): Partial<Record<(typeof STRUCTURAL_KEYS)[number], unknown>> {
  const result: Partial<Record<(typeof STRUCTURAL_KEYS)[number], unknown>> = {};
  for (const key of STRUCTURAL_KEYS) {
    if (Object.hasOwn(propSchema, key)) {
      result[key] = propSchema[key];
    }
  }
  return result;
}

/**
 * Retrieves a property schema by name, failing the test if it is absent.
 * Avoids non-null assertions while keeping test code concise.
 */
function getProp(
  properties: Record<string, Record<string, unknown>>,
  name: string
): Record<string, unknown> {
  const prop = properties[name];
  if (!prop) throw new Error(`property "${name}" is missing from schema`);
  return prop;
}

describe("TSDoc ↔ Chain DSL Parity", () => {
  let tempDir: string;
  let tsdocSchema: Record<string, unknown>;
  let tsdocProperties: Record<string, Record<string, unknown>>;

  const dslResult = buildFormSchemas(ParityContactDSL);
  const dslSchema = dslResult.jsonSchema as Record<string, unknown>;
  const dslProperties = dslSchema["properties"] as Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-parity-"));
    const fixturePath = resolveFixture("tsdoc-class", "parity-contact.ts");
    const result = runCli(["generate", fixturePath, "ParityContact", "-o", tempDir]);
    expect(result.exitCode).toBe(0);

    const schemaFile = findSchemaFile(tempDir, "schema.json");
    expect(schemaFile).toBeDefined();
    if (!schemaFile) throw new Error("Schema file not found");
    tsdocSchema = JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as Record<string, unknown>;
    tsdocProperties = tsdocSchema["properties"] as Record<string, Record<string, unknown>>;
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe("required array parity", () => {
    it("both surfaces mark age, name, email, country as required", () => {
      const tsdocRequired = tsdocSchema["required"] as string[];
      const dslRequired = dslSchema["required"] as string[];
      const expectedRequired = ["age", "name", "email", "country"];
      for (const field of expectedRequired) {
        expect(tsdocRequired).toContain(field);
        expect(dslRequired).toContain(field);
      }
    });

    it("both surfaces mark bio as optional (absent from required)", () => {
      const tsdocRequired = tsdocSchema["required"] as string[];
      const dslRequired = dslSchema["required"] as string[];
      expect(tsdocRequired).not.toContain("bio");
      expect(dslRequired).not.toContain("bio");
    });
  });

  describe("age field — number with minimum and maximum", () => {
    it("TSDoc: has number type with minimum 1 and maximum 100", () => {
      expect(extractStructural(getProp(tsdocProperties, "age"))).toEqual({
        type: "number",
        minimum: 1,
        maximum: 100,
      });
    });

    it("Chain DSL: has number type with minimum 1 and maximum 100", () => {
      expect(extractStructural(getProp(dslProperties, "age"))).toEqual({
        type: "number",
        minimum: 1,
        maximum: 100,
      });
    });

    it("structural output matches between surfaces", () => {
      expect(extractStructural(getProp(tsdocProperties, "age"))).toEqual(
        extractStructural(getProp(dslProperties, "age"))
      );
    });
  });

  describe("name field — string with minLength and maxLength", () => {
    it("TSDoc: has string type with minLength 1 and maxLength 200", () => {
      expect(extractStructural(getProp(tsdocProperties, "name"))).toEqual({
        type: "string",
        minLength: 1,
        maxLength: 200,
      });
    });

    it("Chain DSL: has string type with minLength 1 and maxLength 200", () => {
      expect(extractStructural(getProp(dslProperties, "name"))).toEqual({
        type: "string",
        minLength: 1,
        maxLength: 200,
      });
    });

    it("structural output matches between surfaces", () => {
      expect(extractStructural(getProp(tsdocProperties, "name"))).toEqual(
        extractStructural(getProp(dslProperties, "name"))
      );
    });
  });

  describe("email field — string with pattern constraint", () => {
    it("TSDoc: has string type with email pattern", () => {
      expect(extractStructural(getProp(tsdocProperties, "email"))).toEqual({
        type: "string",
        pattern: "^[^@]+@[^@]+$",
      });
    });

    it("Chain DSL: has string type with email pattern", () => {
      expect(extractStructural(getProp(dslProperties, "email"))).toEqual({
        type: "string",
        pattern: "^[^@]+@[^@]+$",
      });
    });

    it("structural output matches between surfaces", () => {
      expect(extractStructural(getProp(tsdocProperties, "email"))).toEqual(
        extractStructural(getProp(dslProperties, "email"))
      );
    });
  });

  describe("country field — string literal union (enum)", () => {
    it("TSDoc: has enum with correct values", () => {
      expect(extractStructural(getProp(tsdocProperties, "country"))).toEqual({
        enum: ["us", "ca", "uk"],
      });
    });

    it("Chain DSL: has enum with correct values", () => {
      expect(extractStructural(getProp(dslProperties, "country"))).toEqual({
        enum: ["us", "ca", "uk"],
      });
    });

    it("structural output matches between surfaces", () => {
      expect(extractStructural(getProp(tsdocProperties, "country"))).toEqual(
        extractStructural(getProp(dslProperties, "country"))
      );
    });
  });

  describe("bio field — optional string with no constraints", () => {
    it("TSDoc: has string type", () => {
      expect(extractStructural(getProp(tsdocProperties, "bio"))).toEqual({
        type: "string",
      });
    });

    it("Chain DSL: has string type", () => {
      expect(extractStructural(getProp(dslProperties, "bio"))).toEqual({
        type: "string",
      });
    });

    it("structural output matches between surfaces", () => {
      expect(extractStructural(getProp(tsdocProperties, "bio"))).toEqual(
        extractStructural(getProp(dslProperties, "bio"))
      );
    });
  });

  describe("full structural comparison", () => {
    it("all field structural outputs match between surfaces", () => {
      const fieldNames = ["age", "name", "email", "country", "bio"] as const;
      for (const fieldName of fieldNames) {
        expect(extractStructural(getProp(tsdocProperties, fieldName))).toEqual(
          extractStructural(getProp(dslProperties, fieldName))
        );
      }
    });
  });

  describe("Gold-master comparison", () => {
    /**
     * Both surfaces use the same expected file because parity is the goal —
     * both TSDoc class and chain DSL should produce structurally identical
     * JSON Schema output. The file lives under tsdoc-class/ by convention
     * since that surface drives the canonical shape.
     */
    it("TSDoc surface matches expected JSON Schema", () => {
      const expected = loadExpected("tsdoc-class/parity-contact.schema.json");
      expect(tsdocSchema).toEqual(expected);
    });

    it("Chain DSL surface matches expected JSON Schema", () => {
      // Intentionally the same gold-master as TSDoc: both surfaces must produce
      // structurally identical output. See file-level JSDoc for rationale.
      const expected = loadExpected("tsdoc-class/parity-contact.schema.json");
      expect(dslSchema).toEqual(expected);
    });

    it("TSDoc surface matches expected UI Schema", () => {
      const uischemaFile = findSchemaFile(tempDir, "ui_schema.json");
      expect(uischemaFile).toBeDefined();
      if (!uischemaFile) throw new Error("UI Schema file not found");
      const actual = JSON.parse(fs.readFileSync(uischemaFile, "utf-8")) as unknown;
      const expected = loadExpected("tsdoc-class/parity-contact.uischema.json");
      expect(actual).toEqual(expected);
    });
  });
});
