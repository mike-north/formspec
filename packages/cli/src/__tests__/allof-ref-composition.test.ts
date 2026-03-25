/**
 * Tests for allOf + $ref composition of constrained type aliases.
 *
 * Per spec (005 §3.3, 003 §7.2): when a type alias adds constraints to a base
 * type alias, the generated JSON Schema should use allOf + $ref composition
 * rather than flattening all constraints into the field schema.
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import { analyzeClass } from "../analyzer/class-analyzer.js";
import { generateClassSchemas } from "../generators/class-schema.js";

/**
 * Compiles a TypeScript source string, finds the first class, and generates
 * JSON + UI schemas from it.
 */
function getSchemaFromSource(source: string): ReturnType<typeof generateClassSchemas> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-test-"));
  const filePath = path.join(tmpDir, "test.ts");
  fs.writeFileSync(filePath, source);

  try {
    const program = ts.createProgram([filePath], {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ES2020,
      strict: true,
    });
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) throw new Error("Source file not found");

    let classDecl: ts.ClassDeclaration | undefined;
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isClassDeclaration(node)) classDecl = node;
    });
    if (!classDecl) throw new Error("No class found");

    const analysis = analyzeClass(classDecl, checker);
    return generateClassSchemas(analysis, checker);
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
}

// ============================================================================
// allOf + $ref for two-level alias chain
// ============================================================================

describe("allOf + $ref composition — two-level chain", () => {
  const source = `
    /** @multipleOf 1 */
    type Integer = number;

    /** @minimum 0 @maximum 100 */
    type Percentage = Integer;

    export class Form {
      score!: Percentage;
    }
  `;

  it("registers Integer in $defs with base type + multipleOf", () => {
    const { jsonSchema } = getSchemaFromSource(source);
    const schema = jsonSchema as Record<string, unknown>;
    const defs = schema["$defs"] as Record<string, Record<string, unknown>> | undefined;

    expect(defs).toBeDefined();
    if (!defs) throw new Error("$defs not found");
    const intDef = defs["Integer"];
    if (!intDef) throw new Error("Integer $def not found");
    expect(intDef["type"]).toBe("number");
    expect(intDef["multipleOf"]).toBe(1);
  });

  it("registers Percentage in $defs using allOf + $ref to Integer", () => {
    const { jsonSchema } = getSchemaFromSource(source);
    const schema = jsonSchema as Record<string, unknown>;
    const defs = schema["$defs"] as Record<string, Record<string, unknown>> | undefined;

    expect(defs).toBeDefined();
    if (!defs) throw new Error("$defs not found");
    const pctDef = defs["Percentage"];
    if (!pctDef) throw new Error("Percentage $def not found");
    expect(pctDef["allOf"]).toBeDefined();

    const allOf = pctDef["allOf"] as Record<string, unknown>[];
    expect(allOf.some((item) => item["$ref"] === "#/$defs/Integer")).toBe(true);
    expect(allOf.some((item) => item["minimum"] === 0 && item["maximum"] === 100)).toBe(true);
  });

  it("field using constrained alias gets a $ref, not flat constraints", () => {
    const { jsonSchema } = getSchemaFromSource(source);
    const schema = jsonSchema as Record<string, unknown>;
    const props = schema["properties"] as Record<string, Record<string, unknown>>;
    const scoreProp = props["score"];
    if (!scoreProp) throw new Error("score property not found");

    expect(scoreProp["$ref"]).toBe("#/$defs/Percentage");
    // Must NOT have flat constraints on the field
    expect(scoreProp["minimum"]).toBeUndefined();
    expect(scoreProp["maximum"]).toBeUndefined();
    expect(scoreProp["multipleOf"]).toBeUndefined();
    expect(scoreProp["type"]).toBeUndefined();
  });
});

// ============================================================================
// Field-level constraint on top of alias → allOf[$ref, {field constraints}]
// ============================================================================

describe("allOf + $ref composition — field adds constraints on top of alias", () => {
  const source = `
    /** @multipleOf 1 */
    type Integer = number;

    /** @minimum 0 @maximum 100 */
    type Percentage = Integer;

    export class Form {
      /** @minimum 10 */
      cpuUsage!: Percentage;
    }
  `;

  it("field with extra constraints uses allOf with $ref and constraint schema", () => {
    const { jsonSchema } = getSchemaFromSource(source);
    const schema = jsonSchema as Record<string, unknown>;
    const props = schema["properties"] as Record<string, Record<string, unknown>>;

    const cpuField = props["cpuUsage"];
    if (!cpuField) throw new Error("cpuUsage property not found");
    expect(cpuField["allOf"]).toBeDefined();

    const allOf = cpuField["allOf"] as Record<string, unknown>[];
    expect(allOf.some((item) => item["$ref"] === "#/$defs/Percentage")).toBe(true);
    expect(allOf.some((item) => item["minimum"] === 10)).toBe(true);
  });

  it("field $ref still points to Percentage, not Integer", () => {
    const { jsonSchema } = getSchemaFromSource(source);
    const schema = jsonSchema as Record<string, unknown>;
    const props = schema["properties"] as Record<string, Record<string, unknown>>;
    const cpuField = props["cpuUsage"];
    if (!cpuField) throw new Error("cpuUsage property not found");
    const allOf = cpuField["allOf"] as Record<string, unknown>[];
    // The $ref in allOf should point to Percentage (the leaf alias), not Integer
    const refs = allOf.filter((item) => item["$ref"] !== undefined).map((item) => item["$ref"]);
    expect(refs).toContain("#/$defs/Percentage");
    expect(refs).not.toContain("#/$defs/Integer");
  });
});

// ============================================================================
// Simple constrained alias (root — no parent alias)
// ============================================================================

describe("allOf + $ref composition — root constrained alias", () => {
  it("root constrained alias creates a $defs entry with inline type + constraints", () => {
    const { jsonSchema } = getSchemaFromSource(`
      /** @multipleOf 1 */
      type Integer = number;

      export class Form {
        count!: Integer;
      }
    `);
    const schema = jsonSchema as Record<string, unknown>;
    const defs = schema["$defs"] as Record<string, Record<string, unknown>> | undefined;

    expect(defs).toBeDefined();
    if (!defs) throw new Error("$defs not found");
    const integerDef = defs["Integer"];
    if (!integerDef) throw new Error("Integer $def not found");
    expect(integerDef["type"]).toBe("number");
    expect(integerDef["multipleOf"]).toBe(1);

    const props = schema["properties"] as Record<string, Record<string, unknown>>;
    const countProp = props["count"];
    if (!countProp) throw new Error("count property not found");
    expect(countProp["$ref"]).toBe("#/$defs/Integer");
  });
});

// ============================================================================
// Unconstrained (plain) alias — should NOT create $defs
// ============================================================================

describe("allOf + $ref composition — unconstrained aliases", () => {
  it("plain string alias does not create $defs entry", () => {
    const { jsonSchema } = getSchemaFromSource(`
      type Name = string;

      export class Form {
        firstName!: Name;
      }
    `);
    const schema = jsonSchema as Record<string, unknown>;
    const props = schema["properties"] as Record<string, Record<string, unknown>>;
    const firstNameProp = props["firstName"];
    if (!firstNameProp) throw new Error("firstName property not found");

    // Should resolve to the plain primitive, no $defs
    expect(firstNameProp["type"]).toBe("string");
    expect(firstNameProp["$ref"]).toBeUndefined();
    expect(schema["$defs"]).toBeUndefined();
  });

  it("plain number alias does not create $defs entry", () => {
    const { jsonSchema } = getSchemaFromSource(`
      type Count = number;

      export class Form {
        total!: Count;
      }
    `);
    const schema = jsonSchema as Record<string, unknown>;
    const props = schema["properties"] as Record<string, Record<string, unknown>>;
    const totalProp = props["total"];
    if (!totalProp) throw new Error("total property not found");
    expect(totalProp["type"]).toBe("number");
    expect(schema["$defs"]).toBeUndefined();
  });
});

// ============================================================================
// Three-level chain: C → B → A
// ============================================================================

describe("allOf + $ref composition — three-level chain", () => {
  it("each level registered correctly in $defs", () => {
    const { jsonSchema } = getSchemaFromSource(`
      /** @minimum 0 */
      type NonNegative = number;

      /** @maximum 1000 */
      type BoundedNumber = NonNegative;

      /** @multipleOf 5 */
      type MultipleOfFive = BoundedNumber;

      export class Form {
        value!: MultipleOfFive;
      }
    `);
    const schema = jsonSchema as Record<string, unknown>;
    const defs = schema["$defs"] as Record<string, Record<string, unknown>> | undefined;

    expect(defs).toBeDefined();
    if (!defs) throw new Error("$defs not found");

    // NonNegative: root — inline type + constraints
    expect(defs["NonNegative"]).toEqual({ type: "number", minimum: 0 });

    // BoundedNumber: allOf[$ref NonNegative, {maximum: 1000}]
    const bdDef = defs["BoundedNumber"];
    if (!bdDef) throw new Error("BoundedNumber $def not found");
    expect(bdDef["allOf"]).toBeDefined();
    const bdAllOf = bdDef["allOf"] as Record<string, unknown>[];
    expect(bdAllOf.some((i) => i["$ref"] === "#/$defs/NonNegative")).toBe(true);
    expect(bdAllOf.some((i) => i["maximum"] === 1000)).toBe(true);

    // MultipleOfFive: allOf[$ref BoundedNumber, {multipleOf: 5}]
    const mofDef = defs["MultipleOfFive"];
    if (!mofDef) throw new Error("MultipleOfFive $def not found");
    expect(mofDef["allOf"]).toBeDefined();
    const mofAllOf = mofDef["allOf"] as Record<string, unknown>[];
    expect(mofAllOf.some((i) => i["$ref"] === "#/$defs/BoundedNumber")).toBe(true);
    expect(mofAllOf.some((i) => i["multipleOf"] === 5)).toBe(true);

    // Field should $ref the leaf alias
    const props = schema["properties"] as Record<string, Record<string, unknown>>;
    const valueProp = props["value"];
    if (!valueProp) throw new Error("value property not found");
    expect(valueProp["$ref"]).toBe("#/$defs/MultipleOfFive");
  });
});
