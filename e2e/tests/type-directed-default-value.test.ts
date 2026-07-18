/**
 * Type-directed `@defaultValue` parsing — GitHub issue #517.
 *
 * Spec 002 §3.2 requires `@defaultValue` parsing to be type-directed against
 * the resolved target type: coerce to a valid non-string interpretation
 * first, and fall back to string only when no such interpretation fits.
 * Before the fix, `@defaultValue 6` on a `string` field emitted
 * `{ type: "string", default: 6 }` — a `default` that fails validation
 * against its own subschema.
 *
 * This suite drives the real CLI pipeline (fixture → `formspec generate` →
 * generated schema.json) and validates each field's `default` against its
 * own property subschema using `@formspec/validator` (AC5: "Emitted default
 * always validates against the field's own subschema").
 *
 * @see docs/002-tsdoc-grammar.md §3.2 (lines 561-588) for the type-directed
 * parsing algorithm this suite verifies.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createFormSpecValidator } from "@formspec/validator";
import { runCli, resolveFixture, findSchemaFile } from "../helpers/schema-assertions.js";

function loadGeneratedSchema(tempDir: string): Record<string, unknown> {
  const schemaFile = findSchemaFile(tempDir, "schema.json");
  if (!schemaFile) throw new Error(`schema.json not found in ${tempDir}`);
  return JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as Record<string, unknown>;
}

describe("TypeDirectedDefaultsForm — @defaultValue type-directed parsing (issue #517)", () => {
  let tempDir: string;
  let schema: Record<string, unknown>;
  let properties: Record<string, Record<string, unknown>>;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-e2e-default-value-"));
    const fixture = resolveFixture("tsdoc-class", "type-directed-default-value.ts");
    const result = runCli(["generate", fixture, "TypeDirectedDefaultsForm", "-o", tempDir]);
    expect(result.exitCode).toBe(0);
    schema = loadGeneratedSchema(tempDir);
    properties = (schema["properties"] ?? {}) as Record<string, Record<string, unknown>>;
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
  });

  it("code (string field, @defaultValue 6) emits default: '6' (AC1)", () => {
    expect(properties["code"]).toMatchObject({ type: "string", default: "6" });
  });

  it("quantity (number field, @defaultValue 6) emits default: 6 (AC1)", () => {
    expect(properties["quantity"]).toMatchObject({ type: "number", default: 6 });
  });

  it('codeOrQuantity (string|number field, @defaultValue "6" quoted) emits default: "6" (AC2)', () => {
    expect(properties["codeOrQuantity"]?.["default"]).toBe("6");
  });

  it("numericCodeOrQuantity (string|number field, @defaultValue 6 unquoted) emits default: 6 (AC2 complement)", () => {
    expect(properties["numericCodeOrQuantity"]?.["default"]).toBe(6);
  });

  it("flag (boolean field, @defaultValue true) emits default: true (AC3)", () => {
    expect(properties["flag"]).toMatchObject({ type: "boolean", default: true });
  });

  it("flagLabel (string field, @defaultValue true) emits default: 'true' (AC3)", () => {
    expect(properties["flagLabel"]).toMatchObject({ type: "string", default: "true" });
  });

  describe("every emitted default validates against its own generated property subschema (AC5)", () => {
    it("validates each property's default value using @formspec/validator", () => {
      const propertyNames = Object.keys(properties);
      expect(propertyNames.length).toBeGreaterThan(0);

      for (const name of propertyNames) {
        const propertySchema = properties[name];
        if (propertySchema === undefined || !("default" in propertySchema)) continue;

        const validator = createFormSpecValidator(propertySchema);
        const result = validator.validate(propertySchema["default"]);
        expect(
          result.valid,
          `property "${name}" default should validate against its own subschema`
        ).toBe(true);
      }
    });
  });
});
