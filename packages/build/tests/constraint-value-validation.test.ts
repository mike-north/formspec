/**
 * Build-level constraint-value validation (issue #513).
 *
 * Before this fix, the TSDoc extraction pipeline passed value-range/format-invalid
 * constraint arguments straight through to the generated JSON Schema, so a
 * build-only consumer (no ESLint) emitted invalid JSON Schema with NO diagnostic:
 *
 *   - `@minimum Infinity` → `minimum: Infinity` → JSON.stringify → `"minimum": null`
 *     (invalid against the JSON Schema meta-schema).
 *   - `@minLength -5` / `@maxItems 2.5` → negative / fractional length keyword.
 *   - `@pattern (` → `"pattern": "("` → crashes any validator at schema-compile time.
 *   - `@minimum 0x10` → `minimum: 16` while the diagnostic path called it invalid.
 *
 * These tests assert the end-to-end fix: each bad input now produces the
 * spec-normative diagnostic (002 §6) AND the invalid keyword never reaches the
 * generated schema. Expected diagnostic codes are derived from spec 002 §3.2/§6,
 * not from current program output.
 *
 * @see docs/002-tsdoc-grammar.md §3.2 (per-tag validation), §6 (diagnostic codes)
 * @see docs/000-principles.md PP6 (output validates against the meta-schema)
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { generateSchemas } from "../src/generators/class-schema.js";

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** Writes a single-class source file with one constraint-tagged field. */
function writeFieldFixture(tag: string, arg: string, fieldType: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-513-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "model.ts");
  const source = [
    "export class BadForm {",
    `  /** @${tag} ${arg} */`,
    `  field!: ${fieldType};`,
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, source);
  return filePath;
}

interface Family {
  readonly label: string;
  readonly tag: string;
  readonly arg: string;
  readonly fieldType: string;
  /** Spec 002 §6 diagnostic code for this failure class. */
  readonly code: string;
  /** JSON Schema keyword that must never appear in the output. */
  readonly keyword: string;
}

// One representative per family from the issue's acceptance criteria.
const FAMILIES: readonly Family[] = [
  {
    label: "non-finite numeric (Infinity)",
    tag: "minimum",
    arg: "Infinity",
    fieldType: "number",
    code: "INVALID_NUMERIC_VALUE",
    keyword: "minimum",
  },
  {
    label: "non-decimal numeric (0x10)",
    tag: "minimum",
    arg: "0x10",
    fieldType: "number",
    code: "INVALID_NUMERIC_VALUE",
    keyword: "minimum",
  },
  {
    label: "negative length (@minLength -5)",
    tag: "minLength",
    arg: "-5",
    fieldType: "string",
    code: "INVALID_NON_NEGATIVE_INTEGER",
    keyword: "minLength",
  },
  {
    label: "fractional length (@maxItems 2.5)",
    tag: "maxItems",
    arg: "2.5",
    fieldType: "string[]",
    code: "INVALID_NON_NEGATIVE_INTEGER",
    keyword: "maxItems",
  },
  {
    label: "uncompilable pattern (@pattern ()",
    tag: "pattern",
    arg: "(",
    fieldType: "string",
    code: "INVALID_REGEX_PATTERN",
    keyword: "pattern",
  },
];

describe("buildFormSchemas TSDoc pipeline rejects invalid constraint values (issue #513)", () => {
  it.each(FAMILIES)(
    "$label → emits $code and omits the keyword",
    ({ tag, arg, fieldType, code, keyword }) => {
      const filePath = writeFieldFixture(tag, arg, fieldType);

      const result = generateSchemas({
        filePath,
        typeName: "BadForm",
        errorReporting: "diagnostics",
      });

      // 1. The spec-normative diagnostic is surfaced (previously: none).
      expect(result.diagnostics.map((d) => d.code)).toContain(code);

      // 2. The invalid keyword never reaches a generated schema. Error-severity
      //    diagnostics withhold the schema entirely; the serialized-output check
      //    is belt-and-suspenders against a future change that emits a schema
      //    alongside diagnostics.
      const serialized = JSON.stringify(result.jsonSchema ?? null);
      expect(serialized).not.toContain(`"${keyword}"`);
    }
  );

  it("accepts the same fields with valid arguments (control — schema is emitted)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-513-ok-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "model.ts");
    fs.writeFileSync(
      filePath,
      [
        "export class GoodForm {",
        "  /** @minimum 0 */",
        "  count!: number;",
        "  /** @minLength 3 */",
        "  name!: string;",
        "  /** @pattern ^[A-Z]{3}$ */",
        "  code!: string;",
        "}",
        "",
      ].join("\n")
    );

    const result = generateSchemas({
      filePath,
      typeName: "GoodForm",
      errorReporting: "diagnostics",
    });

    expect(result.ok).toBe(true);
    expect(result.jsonSchema?.properties?.["count"]).toMatchObject({ minimum: 0 });
    expect(result.jsonSchema?.properties?.["name"]).toMatchObject({ minLength: 3 });
    expect(result.jsonSchema?.properties?.["code"]).toMatchObject({ pattern: "^[A-Z]{3}$" });
  });
});
