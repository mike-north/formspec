/**
 * E2E tests for feature composition: multiple DSL features interacting on the same form.
 *
 * Tests that annotations and constraints can be combined on the same field
 * without interfering with each other, and that complex type compositions
 * (nullable fields, arrays with path-targeted constraints, all-numeric-bounds)
 * produce correct schemas.
 *
 * @see 002-tsdoc-grammar.md §2.1 (constraint tags), §2.2 (annotation tags)
 * @see 003-json-schema-vocabulary.md §2.6 (numeric constraints), §2.7 (string constraints), §2.8 (annotations)
 * @see 003-json-schema-vocabulary.md §2.3 (union types / nullable), §2.4 (arrays), §5.2 ($defs)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  runCli,
  resolveFixture,
  findSchemaFile,
  loadExpected,
} from "../helpers/schema-assertions.js";

describe("TSDoc Feature Composition", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-feature-composition-"));
    const fixturePath = resolveFixture("tsdoc-class", "feature-composition.ts");
    const result = runCli(["generate", fixturePath, "FeatureComposition", "-o", tempDir]);
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

  it("has correct top-level schema structure", () => {
    expect(schema).toHaveProperty("type", "object");
    expect(schema).toHaveProperty("properties");
    expect(schema).toHaveProperty("$defs");
  });

  // spec 003 §5.2: All named types are represented as $defs entries.
  it("defines Address in $defs", () => {
    const defs = schema["$defs"] as Record<string, unknown>;
    expect(defs).toHaveProperty("Address");
    const address = defs["Address"] as Record<string, unknown>;
    expect(address).toHaveProperty("type", "object");
  });

  describe("$defs/Address — constraints on named interface properties", () => {
    let addressDef: Record<string, Record<string, unknown>>;

    beforeAll(() => {
      const defs = schema["$defs"] as Record<string, unknown>;
      const address = defs["Address"] as Record<string, unknown>;
      addressDef = address["properties"] as Record<string, Record<string, unknown>>;
    });

    it("plain properties have string type", () => {
      expect(addressDef["street"]).toEqual({ type: "string" });
      expect(addressDef["city"]).toEqual({ type: "string" });
    });

    // spec 002 §2.1, 003 §2.7: @pattern → "pattern" keyword on string properties
    it("state has @pattern constraint (spec 003 §2.7)", () => {
      expect(addressDef["state"]).toMatchObject({
        type: "string",
        pattern: "^[A-Z]{2}$",
      });
    });

    it("zip has @pattern constraint (spec 003 §2.7)", () => {
      expect(addressDef["zip"]).toMatchObject({
        type: "string",
        pattern: "^\\d{5}$",
      });
    });

    it("all Address properties are required", () => {
      const address = (schema["$defs"] as Record<string, unknown>)["Address"] as Record<
        string,
        unknown
      >;
      const required = address["required"] as string[];
      expect(required).toContain("street");
      expect(required).toContain("city");
      expect(required).toContain("state");
      expect(required).toContain("zip");
    });
  });

  // spec 003 §2.6 + §2.7 + §2.8: multiple annotations AND constraints simultaneously
  describe("name field — annotations + constraints simultaneously (spec 003 §2.6–§2.8)", () => {
    it("has string type", () => {
      expect(properties["name"]?.["type"]).toBe("string");
    });

    it("has @displayName → title (spec 003 §2.8)", () => {
      expect(properties["name"]?.["title"]).toBe("Full Name");
    });

    it("has @description → description (spec 003 §2.8)", () => {
      expect(properties["name"]?.["description"]).toBe("The user's legal name");
    });

    it("has @minLength constraint (spec 003 §2.7)", () => {
      expect(properties["name"]?.["minLength"]).toBe(1);
    });

    it("has @maxLength constraint (spec 003 §2.7)", () => {
      expect(properties["name"]?.["maxLength"]).toBe(200);
    });

    it("has @deprecated annotation (spec 003 §2.8)", () => {
      expect(properties["name"]?.["deprecated"]).toBe(true);
    });

    it("all of title, description, minLength, maxLength, deprecated are present simultaneously", () => {
      const name = properties["name"];
      expect(name).toHaveProperty("title");
      expect(name).toHaveProperty("description");
      expect(name).toHaveProperty("minLength");
      expect(name).toHaveProperty("maxLength");
      expect(name).toHaveProperty("deprecated");
    });
  });

  // spec 003 §2.3: Nullable type T | null → anyOf with null branch.
  // Constraints are applied to the anyOf wrapper (current implementation behavior).
  describe("age field — constraints on nullable field (spec 003 §2.3 + §2.6)", () => {
    it("uses anyOf for nullable number type", () => {
      const age = properties["age"];
      expect(age).toHaveProperty("anyOf");
      const anyOf = age?.["anyOf"] as unknown[];
      expect(anyOf).toContainEqual({ type: "number" });
      expect(anyOf).toContainEqual({ type: "null" });
    });

    it("has @minimum constraint (spec 003 §2.6)", () => {
      expect(properties["age"]?.["minimum"]).toBe(0);
    });

    it("has @maximum constraint (spec 003 §2.6)", () => {
      expect(properties["age"]?.["maximum"]).toBe(150);
    });

    it("is not in required (optional field)", () => {
      const required = schema["required"] as string[];
      expect(required).not.toContain("age");
    });
  });

  // spec 002 §4.3: path-target syntax targets array item sub-properties.
  // spec 003 §2.4: minItems/maxItems on arrays.
  describe("addresses field — array-level constraints + path-targeted item constraints (spec 002 §4.3)", () => {
    it("has array type", () => {
      expect(properties["addresses"]?.["type"]).toBe("array");
    });

    it("has @minItems constraint on the array (spec 003 §2.4)", () => {
      expect(properties["addresses"]?.["minItems"]).toBe(1);
    });

    it("has @maxItems constraint on the array (spec 003 §2.4)", () => {
      expect(properties["addresses"]?.["maxItems"]).toBe(5);
    });

    // spec 002 §4.3 array transparency: path-targeted constraints target items sub-schema
    it("items uses allOf with $ref for path-targeted constraint", () => {
      const addresses = properties["addresses"];
      const items = addresses?.["items"] as Record<string, unknown>;
      expect(items).toHaveProperty("allOf");
      const allOf = items["allOf"] as Record<string, unknown>[];
      expect(allOf).toContainEqual({ $ref: "#/$defs/Address" });
    });

    it("items allOf contains property override for street minLength (spec 002 §4.3)", () => {
      const addresses = properties["addresses"];
      const items = addresses?.["items"] as Record<string, unknown>;
      const allOf = items["allOf"] as Record<string, unknown>[];
      const override = allOf.find((m) => m["properties"] !== undefined);
      expect(override).toBeDefined();
      if (!override) throw new Error("override not found");
      const overrideProps = override["properties"] as Record<string, Record<string, unknown>>;
      expect(overrideProps["street"]).toMatchObject({ minLength: 1 });
    });
  });

  // spec 003 §2.6: All five numeric constraint types can coexist on the same field.
  describe("preciseScore field — all numeric constraints combined (spec 003 §2.6)", () => {
    it("has number type", () => {
      expect(properties["preciseScore"]?.["type"]).toBe("number");
    });

    it("has @minimum (inclusive lower bound)", () => {
      expect(properties["preciseScore"]?.["minimum"]).toBe(0);
    });

    it("has @maximum (inclusive upper bound)", () => {
      expect(properties["preciseScore"]?.["maximum"]).toBe(100);
    });

    it("has @exclusiveMinimum (exclusive lower bound)", () => {
      expect(properties["preciseScore"]?.["exclusiveMinimum"]).toBe(0);
    });

    it("has @exclusiveMaximum (exclusive upper bound)", () => {
      expect(properties["preciseScore"]?.["exclusiveMaximum"]).toBe(100);
    });

    it("has @multipleOf", () => {
      expect(properties["preciseScore"]?.["multipleOf"]).toBe(0.5);
    });

    it("multipleOf 0.5 does NOT promote type to integer (only multipleOf:1 does)", () => {
      // spec 003 §2.1: integer promotion only when multipleOf === 1
      expect(properties["preciseScore"]?.["type"]).toBe("number");
    });

    it("all five numeric constraints are present simultaneously", () => {
      const score = properties["preciseScore"];
      expect(score).toHaveProperty("minimum");
      expect(score).toHaveProperty("maximum");
      expect(score).toHaveProperty("exclusiveMinimum");
      expect(score).toHaveProperty("exclusiveMaximum");
      expect(score).toHaveProperty("multipleOf");
    });
  });

  it("required fields are correct", () => {
    const required = schema["required"] as string[];
    expect(required).toContain("name");
    expect(required).toContain("addresses");
    expect(required).toContain("preciseScore");
    expect(required).not.toContain("age");
  });

  describe("Gold-master comparison", () => {
    it("matches expected JSON Schema", () => {
      const expected = loadExpected("tsdoc-class/feature-composition.schema.json");
      expect(schema).toEqual(expected);
    });

    it("matches expected UI Schema", () => {
      const uischemaFile = findSchemaFile(tempDir, "ui_schema.json");
      expect(uischemaFile).toBeDefined();
      if (!uischemaFile) throw new Error("UI Schema file not found");
      const actual = JSON.parse(fs.readFileSync(uischemaFile, "utf-8")) as unknown;
      const expected = loadExpected("tsdoc-class/feature-composition.uischema.json");
      expect(actual).toEqual(expected);
    });
  });
});
