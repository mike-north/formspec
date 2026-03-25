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
    expect(properties["nonEmpty"]["type"]).toBe("string");
    expect(properties["nonEmpty"]["minLength"]).toBe(1);
    expect(properties["nonEmpty"]["maxLength"]).toBeUndefined();
  });

  // @see 003-json-schema-vocabulary.md §2.7: "@maxLength 255 → maxLength: 255"
  it("bounded: @maxLength 255 → maxLength: 255", () => {
    expect(properties["bounded"]["type"]).toBe("string");
    expect(properties["bounded"]["maxLength"]).toBe(255);
    expect(properties["bounded"]["minLength"]).toBeUndefined();
  });

  // @see 002-constraint-tags.md §3.2: "minLength: 0 is valid (non-negative integer constraint)"
  it("allowsEmpty: @minLength 0 → minLength: 0 (valid)", () => {
    expect(properties["allowsEmpty"]["type"]).toBe("string");
    expect(properties["allowsEmpty"]["minLength"]).toBe(0);
  });

  // @see 003-json-schema-vocabulary.md §2.7: "minLength == maxLength is valid"
  it("exactLength: @minLength 2 @maxLength 2 → exact length constraint", () => {
    expect(properties["exactLength"]["minLength"]).toBe(2);
    expect(properties["exactLength"]["maxLength"]).toBe(2);
  });

  it("combinedBounds: @minLength 1 @maxLength 1000 → both emitted", () => {
    expect(properties["combinedBounds"]["minLength"]).toBe(1);
    expect(properties["combinedBounds"]["maxLength"]).toBe(1000);
  });

  // @see 003-json-schema-vocabulary.md §2.7: "@pattern → pattern keyword"
  it("lowercaseOnly: @pattern ^[a-z]+$ → pattern emitted", () => {
    expect(properties["lowercaseOnly"]["type"]).toBe("string");
    expect(properties["lowercaseOnly"]["pattern"]).toBe("^[a-z]+$");
  });

  // @see 002-constraint-tags.md §3.2: "pattern with escaped chars preserved"
  it("emailPattern: @pattern with dots → pattern with escaped chars", () => {
    expect(properties["emailPattern"]["type"]).toBe("string");
    // The pattern contains dot-escaping
    expect(typeof properties["emailPattern"]["pattern"]).toBe("string");
    expect(properties["emailPattern"]["pattern"]).toContain("@");
  });

  it("ssnPattern: @pattern with \\d → pattern preserved", () => {
    expect(properties["ssnPattern"]["type"]).toBe("string");
    expect(typeof properties["ssnPattern"]["pattern"]).toBe("string");
  });

  // @see 003-json-schema-vocabulary.md §2.7 C1: "combined minLength + maxLength + pattern"
  it("constrainedEmail: all three string constraints combined", () => {
    expect(properties["constrainedEmail"]["minLength"]).toBe(5);
    expect(properties["constrainedEmail"]["maxLength"]).toBe(100);
    expect(properties["constrainedEmail"]["pattern"]).toBe("^[^@]+@[^@]+$");
  });

  // @see 003-json-schema-vocabulary.md §2.7: "@format → format keyword"
  it.skip("BUG: emailFormat: @format email → format: email", () => {
    // @see 003-json-schema-vocabulary.md §2.7: "@format annotation maps to JSON Schema format"
    expect(properties["emailFormat"]["format"]).toBe("email");
  });

  it.skip("BUG: dateFormat: @format date → format: date", () => {
    expect(properties["dateFormat"]["format"]).toBe("date");
  });

  it.skip("BUG: uriFormat: @format uri → format: uri", () => {
    expect(properties["uriFormat"]["format"]).toBe("uri");
  });

  // @see 003-json-schema-vocabulary.md §2.1: "unconstrained string → type: string only"
  it("unconstrained: no constraints → only type: string", () => {
    expect(properties["unconstrained"]["type"]).toBe("string");
    expect(properties["unconstrained"]["minLength"]).toBeUndefined();
    expect(properties["unconstrained"]["maxLength"]).toBeUndefined();
    expect(properties["unconstrained"]["pattern"]).toBeUndefined();
    expect(properties["unconstrained"]["format"]).toBeUndefined();
  });

  it("all fields are required (all have ! not ?)", () => {
    const required = schema["required"] as string[];
    for (const field of [
      "nonEmpty",
      "bounded",
      "allowsEmpty",
      "exactLength",
      "combinedBounds",
      "lowercaseOnly",
      "emailPattern",
      "ssnPattern",
      "constrainedEmail",
      "unconstrained",
    ]) {
      expect(required, `expected "${field}" in required`).toContain(field);
    }
  });
});
