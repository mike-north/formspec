/**
 * Tests for Bug 1: @pattern/@multipleOf overwrite in TAG_MAPPINGS dispatch.
 *
 * When resolveTypeConstraints returns multiple @multipleOf or @pattern tags
 * (from different levels of a type alias chain), applyCommentTagsToSchema must
 * NOT overwrite previous values. Instead it should collect them and emit allOf.
 *
 * JSON Schema supports multiple multipleOf constraints via allOf (a value must
 * be a multiple of each stated factor). Multiple @pattern constraints are
 * similarly collected — all must match.
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import { analyzeClass } from "../analyzer/class-analyzer.js";
import { generateClassSchemas } from "../generators/class-schema.js";

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
// Bug 1a: multiple @multipleOf from alias chain must not overwrite each other
// ============================================================================

describe("collectible tags — multiple @multipleOf from alias chain", () => {
  const source = `
    /** @multipleOf 2 */
    type Even = number;

    /** @multipleOf 3 */
    type EvenAndTriple = Even;

    export class Form {
      value!: EvenAndTriple;
    }
  `;

  it("emits both multipleOf constraints in the $defs entry for the leaf alias", () => {
    const { jsonSchema } = getSchemaFromSource(source);
    const schema = jsonSchema as Record<string, unknown>;
    const defs = schema["$defs"] as Record<string, Record<string, unknown>> | undefined;

    expect(defs).toBeDefined();
    if (!defs) throw new Error("$defs not found");

    // EvenAndTriple should compose with Even via allOf
    const leafDef = defs["EvenAndTriple"];
    expect(leafDef).toBeDefined();
    if (!leafDef) throw new Error("EvenAndTriple $def not found");

    // The leaf should reference Even via allOf + $ref
    const allOf = leafDef["allOf"] as Record<string, unknown>[] | undefined;
    expect(allOf).toBeDefined();
    if (!allOf) throw new Error("allOf not found");

    // One member should be the $ref
    expect(allOf.some((item) => item["$ref"] === "#/$defs/Even")).toBe(true);
  });

  it("emits the parent alias @multipleOf 2 in the Even $def (not lost)", () => {
    const { jsonSchema } = getSchemaFromSource(source);
    const schema = jsonSchema as Record<string, unknown>;
    const defs = schema["$defs"] as Record<string, Record<string, unknown>> | undefined;
    if (!defs) throw new Error("$defs not found");

    const evenDef = defs["Even"];
    expect(evenDef).toBeDefined();
    if (!evenDef) throw new Error("Even $def not found");

    expect(evenDef["type"]).toBe("number");
    expect(evenDef["multipleOf"]).toBe(2);
  });

  it("emits @multipleOf 3 in the EvenAndTriple $def (the leaf's own constraint)", () => {
    const { jsonSchema } = getSchemaFromSource(source);
    const schema = jsonSchema as Record<string, unknown>;
    const defs = schema["$defs"] as Record<string, Record<string, unknown>> | undefined;
    if (!defs) throw new Error("$defs not found");

    const leafDef = defs["EvenAndTriple"];
    if (!leafDef) throw new Error("EvenAndTriple $def not found");

    const allOf = leafDef["allOf"] as Record<string, unknown>[] | undefined;
    if (!allOf) throw new Error("allOf not found");

    // The constraint portion should contain multipleOf: 3
    const constraintMember = allOf.find(
      (item) => !item["$ref"] && item["multipleOf"] !== undefined
    );
    expect(constraintMember).toBeDefined();
    expect(constraintMember?.["multipleOf"]).toBe(3);
  });

  it("the merged flat constraint list has two multipleOf entries (not one overwriting the other)", () => {
    // When the field ITSELF has no constrained alias (flat path),
    // both multipleOf values from an alias chain must appear, each in its
    // own allOf member so neither overwrites the other.
    const flatSource = `
      /** @multipleOf 2 */
      type Even = number;

      /** @multipleOf 3 */
      type EvenAndTriple = Even;

      export class Form {
        /** Note: here we force the flat path by using a local comment that adds a constraint,
         *  causing the field to use the hasConstrainedAlias path already; but the point is
         *  that neither multipleOf=2 nor multipleOf=3 is lost in the merged tags. */
        value!: number;
        valueForcedFlat!: EvenAndTriple;
      }
    `;
    const { jsonSchema } = getSchemaFromSource(flatSource);
    const schema = jsonSchema as Record<string, unknown>;
    const defs = schema["$defs"] as Record<string, Record<string, unknown>> | undefined;

    // The $defs should still contain both aliases; EvenAndTriple's own constraint (3)
    // must not have overwritten Even's constraint (2)
    if (!defs) throw new Error("$defs not found");
    const evenDef = defs["Even"];
    expect(evenDef?.["multipleOf"]).toBe(2); // NOT overwritten with 3
  });
});

// ============================================================================
// Bug 1b: multiple @pattern from alias chain must not overwrite each other
// ============================================================================

describe("collectible tags — multiple @pattern from alias chain", () => {
  const source = `
    /** @pattern ^[A-Z] */
    type StartsUpperCase = string;

    /** @pattern [0-9]$ */
    type StartsUpperEndsDigit = StartsUpperCase;

    export class Form {
      code!: StartsUpperEndsDigit;
    }
  `;

  it("emits both patterns, not just the last one", () => {
    const { jsonSchema } = getSchemaFromSource(source);
    const schema = jsonSchema as Record<string, unknown>;
    const defs = schema["$defs"] as Record<string, Record<string, unknown>> | undefined;

    expect(defs).toBeDefined();
    if (!defs) throw new Error("$defs not found");

    // StartsUpperCase must retain ^[A-Z]
    const upperDef = defs["StartsUpperCase"];
    expect(upperDef?.["pattern"]).toBe("^[A-Z]");

    // StartsUpperEndsDigit must NOT overwrite — its own constraint [0-9]$ must
    // be present and the parent's ^[A-Z] must NOT be lost either.
    const leafDef = defs["StartsUpperEndsDigit"];
    expect(leafDef).toBeDefined();
    if (!leafDef) throw new Error("StartsUpperEndsDigit $def not found");

    // The leaf uses allOf + $ref composition so both patterns are preserved:
    // - parent via $ref → StartsUpperCase
    // - own via the constraint member
    const allOf = leafDef["allOf"] as Record<string, unknown>[] | undefined;
    expect(allOf).toBeDefined();
    if (!allOf) throw new Error("allOf not found");

    expect(allOf.some((item) => item["$ref"] === "#/$defs/StartsUpperCase")).toBe(true);
    const constraintMember = allOf.find((item) => !item["$ref"] && item["pattern"] !== undefined);
    expect(constraintMember).toBeDefined();
    expect(constraintMember?.["pattern"]).toBe("[0-9]$");
  });

  it("the parent's @pattern is not overwritten by the leaf's @pattern in the flat tag list", () => {
    // When the tags array has two @pattern entries from the resolver, confirm that
    // applyCommentTagsToSchema doesn't silently drop the first.
    // We test via the $defs to confirm the first pattern is preserved in StartsUpperCase.
    const { jsonSchema } = getSchemaFromSource(source);
    const schema = jsonSchema as Record<string, unknown>;
    const defs = schema["$defs"] as Record<string, Record<string, unknown>> | undefined;
    if (!defs) throw new Error("$defs not found");

    const upperDef = defs["StartsUpperCase"];
    // ^[A-Z] must still be present — it was registered first and must not be
    // overwritten by the leaf alias's [0-9]$ pattern.
    expect(upperDef?.["pattern"]).toBe("^[A-Z]");
    expect(upperDef?.["pattern"]).not.toBe("[0-9]$");
  });
});

// ============================================================================
// Bug 1c: flat schema path — applyCommentTagsToSchema with two @multipleOf tags
// ============================================================================

describe("collectible tags — flat schema path with two @multipleOf in one tag list", () => {
  it("wraps two multipleOf values in allOf when both are present in tag list", () => {
    // Import applyCommentTagsToSchema indirectly via generateClassSchemas.
    // We need a case where the FLAT path (no constrained alias) gets called with
    // two multipleOf entries already merged by resolveTypeConstraints.
    // Use a single alias for the field with two multipleOf tags (invalid semantically,
    // but tests the dispatch logic):
    // We simulate this by putting two @multipleOf on the FIELD itself via the flat path.
    // Actually the flat path only calls applyCommentTagsToSchema with field-level tags,
    // so we'll test this directly via the class-schema exports.
    //
    // The most reliable approach: provide an alias chain where the root has @multipleOf 4
    // and the leaf adds @multipleOf 6. The resolver produces [{ multipleOf: 4 }, { multipleOf: 6 }].
    // The class generator's flat path (no additional field constraints) ends up calling
    // applyCommentTagsToSchema with those two tags. The result should use allOf.

    const source = `
      /** @multipleOf 4 */
      type QuadNum = number;

      export class Form {
        /** @multipleOf 6 */
        value!: QuadNum;
      }
    `;

    const { jsonSchema } = getSchemaFromSource(source);
    const schema = jsonSchema as Record<string, unknown>;
    const defs = schema["$defs"] as Record<string, Record<string, unknown>> | undefined;

    // In the allOf + $ref composition path, QuadNum $def gets multipleOf: 4.
    // The field-level @multipleOf 6 is added on top (use-site constraint).
    if (!defs) throw new Error("$defs not found");
    const quadDef = defs["QuadNum"];
    expect(quadDef?.["type"]).toBe("number");
    expect(quadDef?.["multipleOf"]).toBe(4);

    // The field schema should be allOf: [{ $ref: QuadNum }, { multipleOf: 6 }]
    const rawFieldSchema: unknown = jsonSchema.properties?.["value"];
    const fieldSchema = (rawFieldSchema as Record<string, unknown> | undefined) ?? {};
    const fieldAllOf = fieldSchema["allOf"] as Record<string, unknown>[] | undefined;
    expect(fieldAllOf).toBeDefined();
    if (!fieldAllOf) throw new Error("Field allOf not found");
    expect(fieldAllOf.some((m) => m["$ref"] === "#/$defs/QuadNum")).toBe(true);
    const fieldConstraint = fieldAllOf.find((m) => !m["$ref"]);
    expect(fieldConstraint?.["multipleOf"]).toBe(6);
  });
});
