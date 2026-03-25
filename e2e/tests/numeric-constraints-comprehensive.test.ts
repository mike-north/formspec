/**
 * @see 003-json-schema-vocabulary.md §2.6: "Numeric constraint keywords: minimum, maximum,
 *   exclusiveMinimum, exclusiveMaximum, multipleOf"
 * @see 002-constraint-tags.md §3.2: "Constraint tag values are parsed as numbers"
 * @see 005-constraint-propagation.md §2.2: "multipleOf: 1 on number → type: integer"
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

describe("Numeric Constraints — comprehensive", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-numeric-"));
    const fixturePath = resolveFixture("tsdoc-class", "numeric-constraints-comprehensive.ts");
    const result = runCli(["generate", fixturePath, "NumericConstraintsForm", "-o", tempDir]);
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

  // @see 003-json-schema-vocabulary.md §2.6: "@minimum 0 → minimum: 0"
  it("nonNegative: @minimum 0 → minimum: 0", () => {
    expect(properties["nonNegative"]["type"]).toBe("number");
    expect(properties["nonNegative"]["minimum"]).toBe(0);
  });

  // @see 002-constraint-tags.md §3.2: "negative values are valid for @minimum"
  it("allowsNegative: @minimum -100 → minimum: -100", () => {
    expect(properties["allowsNegative"]["type"]).toBe("number");
    expect(properties["allowsNegative"]["minimum"]).toBe(-100);
  });

  // @see 003-json-schema-vocabulary.md §2.6: "minimum == maximum is valid"
  it("exactlyZero: @minimum 0 @maximum 0 → both emitted", () => {
    expect(properties["exactlyZero"]["minimum"]).toBe(0);
    expect(properties["exactlyZero"]["maximum"]).toBe(0);
  });

  // @see 002-constraint-tags.md §3.2: "float values are preserved"
  it("floatBounds: @minimum 0.5 @maximum 99.5 → float values preserved", () => {
    expect(properties["floatBounds"]["minimum"]).toBe(0.5);
    expect(properties["floatBounds"]["maximum"]).toBe(99.5);
  });

  // @see 003-json-schema-vocabulary.md §2.6: "@exclusiveMinimum → exclusiveMinimum keyword"
  it("strictlyPositive: @exclusiveMinimum 0 → exclusiveMinimum: 0", () => {
    expect(properties["strictlyPositive"]["type"]).toBe("number");
    expect(properties["strictlyPositive"]["exclusiveMinimum"]).toBe(0);
    // Must NOT also set minimum
    expect(properties["strictlyPositive"]["minimum"]).toBeUndefined();
  });

  // @see 003-json-schema-vocabulary.md §2.6: "@exclusiveMaximum → exclusiveMaximum keyword"
  it("strictlyBelow100: @exclusiveMaximum 100 → exclusiveMaximum: 100", () => {
    expect(properties["strictlyBelow100"]["type"]).toBe("number");
    expect(properties["strictlyBelow100"]["exclusiveMaximum"]).toBe(100);
    expect(properties["strictlyBelow100"]["maximum"]).toBeUndefined();
  });

  // @see 003-json-schema-vocabulary.md §2.6: "combined exclusive bounds"
  it("openInterval: @exclusiveMinimum 0 @exclusiveMaximum 1 → both exclusive keywords", () => {
    expect(properties["openInterval"]["exclusiveMinimum"]).toBe(0);
    expect(properties["openInterval"]["exclusiveMaximum"]).toBe(1);
    expect(properties["openInterval"]["minimum"]).toBeUndefined();
    expect(properties["openInterval"]["maximum"]).toBeUndefined();
  });

  // @see 003-json-schema-vocabulary.md §2.6: "mixed inclusive+exclusive bounds"
  it("mixedBounds: @minimum 0 @exclusiveMaximum 100 → minimum + exclusiveMaximum", () => {
    expect(properties["mixedBounds"]["minimum"]).toBe(0);
    expect(properties["mixedBounds"]["exclusiveMaximum"]).toBe(100);
    expect(properties["mixedBounds"]["maximum"]).toBeUndefined();
  });

  it("mixedBoundsReverse: @exclusiveMinimum -1 @maximum 1 → exclusiveMinimum + maximum", () => {
    expect(properties["mixedBoundsReverse"]["exclusiveMinimum"]).toBe(-1);
    expect(properties["mixedBoundsReverse"]["maximum"]).toBe(1);
    expect(properties["mixedBoundsReverse"]["minimum"]).toBeUndefined();
  });

  // @see 003-json-schema-vocabulary.md §2.1: "multipleOf: 0.01 does NOT promote to integer"
  // @see 005-constraint-propagation.md §2.2: "only multipleOf: 1 promotes type to integer"
  it("currency: @multipleOf 0.01 → multipleOf: 0.01, type stays number (NOT integer)", () => {
    expect(properties["currency"]["type"]).toBe("number");
    expect(properties["currency"]["multipleOf"]).toBe(0.01);
  });

  // @see 005-constraint-propagation.md §2.2: "multipleOf: 5 does NOT promote to integer"
  it("steppedBy5: @multipleOf 5 → multipleOf: 5, type stays number (NOT integer)", () => {
    expect(properties["steppedBy5"]["type"]).toBe("number");
    expect(properties["steppedBy5"]["multipleOf"]).toBe(5);
  });

  // @see 003-json-schema-vocabulary.md §2.6: "all three bounds combined"
  it("percentStepped: @minimum 0 @maximum 100 @multipleOf 5 → all three emitted", () => {
    expect(properties["percentStepped"]["minimum"]).toBe(0);
    expect(properties["percentStepped"]["maximum"]).toBe(100);
    expect(properties["percentStepped"]["multipleOf"]).toBe(5);
    // multipleOf: 5 does not promote to integer
    expect(properties["percentStepped"]["type"]).toBe("number");
  });

  // @see 003-json-schema-vocabulary.md §2.1: "unconstrained number → type: number only"
  it("unconstrained: no constraints → only type: number", () => {
    expect(properties["unconstrained"]["type"]).toBe("number");
    expect(properties["unconstrained"]["minimum"]).toBeUndefined();
    expect(properties["unconstrained"]["maximum"]).toBeUndefined();
    expect(properties["unconstrained"]["multipleOf"]).toBeUndefined();
  });

  it("all fields are required (all have ! not ?)", () => {
    const required = schema["required"] as string[];
    for (const field of [
      "nonNegative",
      "allowsNegative",
      "exactlyZero",
      "floatBounds",
      "strictlyPositive",
      "strictlyBelow100",
      "openInterval",
      "mixedBounds",
      "mixedBoundsReverse",
      "currency",
      "steppedBy5",
      "percentStepped",
      "unconstrained",
    ]) {
      expect(required, `expected "${field}" in required`).toContain(field);
    }
  });
});
