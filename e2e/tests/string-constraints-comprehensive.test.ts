/**
 * @see 003-json-schema-vocabulary.md §2.7: "String constraint keywords: minLength, maxLength, pattern, format"
 * @see 002-constraint-tags.md §3.2: "Constraint tag values for strings: non-negative integer for length constraints"
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

describe("String Constraints — comprehensive", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-string-"));
    const fixturePath = resolveFixture("tsdoc-class", "string-constraints-comprehensive.ts");
    const result = runCli(["generate", fixturePath, "StringConstraintsForm", "-o", tempDir]);
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

  // @see 003-json-schema-vocabulary.md §2.7: "@minLength 1 → minLength: 1"
  it("nonEmpty: @minLength 1 → minLength: 1", () => {
    expect(properties["nonEmpty"]).toEqual({ type: "string", minLength: 1 });
  });

  // @see 003-json-schema-vocabulary.md §2.7: "@maxLength 255 → maxLength: 255"
  it("bounded: @maxLength 255 → maxLength: 255", () => {
    expect(properties["bounded"]).toEqual({ type: "string", maxLength: 255 });
  });

  // @see 002-constraint-tags.md §3.2: "minLength: 0 is valid (non-negative integer constraint)"
  it("allowsEmpty: @minLength 0 → minLength: 0 (valid)", () => {
    expect(properties["allowsEmpty"]).toEqual({ type: "string", minLength: 0 });
  });

  // @see 003-json-schema-vocabulary.md §2.7: "minLength == maxLength is valid"
  it("exactLength: @minLength 2 @maxLength 2 → exact length constraint", () => {
    expect(properties["exactLength"]).toEqual({
      type: "string",
      minLength: 2,
      maxLength: 2,
    });
  });

  // @see 003-json-schema-vocabulary.md §2.7 C1: "combined minLength + maxLength"
  it("combinedBounds: @minLength 1 @maxLength 1000 → both emitted", () => {
    expect(properties["combinedBounds"]).toEqual({
      type: "string",
      minLength: 1,
      maxLength: 1000,
    });
  });

  // @see 003-json-schema-vocabulary.md §2.7: "@pattern → pattern keyword"
  it("lowercaseOnly: @pattern ^[a-z]+$ → pattern emitted", () => {
    expect(properties["lowercaseOnly"]).toEqual({
      type: "string",
      pattern: "^[a-z]+$",
    });
  });

  // @see 002-constraint-tags.md §3.2: "pattern with escaped chars preserved"
  it("emailPattern: @pattern with dots → pattern with escaped chars", () => {
    expect(properties["emailPattern"]).toEqual({
      type: "string",
      pattern: "^[^@]+@[^@]+\\.[^@]+$",
    });
  });

  // @see 002-constraint-tags.md §3.2: "pattern payload is preserved literally after parsing"
  it("ssnPattern: @pattern with \\d → pattern preserved", () => {
    expect(properties["ssnPattern"]).toEqual({
      type: "string",
      pattern: "^\\d{3}-\\d{2}-\\d{4}$",
    });
  });

  // @see 003-json-schema-vocabulary.md §2.7 C1: "combined minLength + maxLength + pattern"
  it("constrainedEmail: all three string constraints combined", () => {
    expect(properties["constrainedEmail"]).toEqual({
      type: "string",
      minLength: 5,
      maxLength: 100,
      pattern: "^[^@]+@[^@]+$",
    });
  });

  // @see 003-json-schema-vocabulary.md §2.7: "@format → format keyword"
  it("emailFormat: @format email → format: email", () => {
    expect(properties["emailFormat"]["format"]).toBe("email");
  });

  it("dateFormat: @format date → format: date", () => {
    expect(properties["dateFormat"]["format"]).toBe("date");
  });

  it("uriFormat: @format uri → format: uri", () => {
    expect(properties["uriFormat"]["format"]).toBe("uri");
  });

  // @see 003-json-schema-vocabulary.md §2.1: "unconstrained string → type: string only"
  it("unconstrained: no constraints → only type: string", () => {
    expect(properties["unconstrained"]).toEqual({ type: "string" });
  });

  it("all fields are required (all have ! not ?)", () => {
    const required = schema["required"] as string[];
    expect(required).toHaveLength(13);
    expect(required).toEqual(
      expect.arrayContaining([
        "nonEmpty",
        "bounded",
        "allowsEmpty",
        "exactLength",
        "combinedBounds",
        "lowercaseOnly",
        "emailPattern",
        "ssnPattern",
        "constrainedEmail",
        "emailFormat",
        "dateFormat",
        "uriFormat",
        "unconstrained",
      ])
    );
  });
});
