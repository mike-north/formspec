/**
 * Regression tests for issue #367: type-level `@format` annotations declared
 * on a base interface must be inherited by derived interfaces / classes when
 * the derived type is emitted as a `$defs` entry. Explicit `@format` on the
 * derived type must win over the inherited value.
 *
 * @see https://github.com/mike-north/formspec/issues/367
 * @see packages/build/src/analyzer/class-analyzer.ts — named-type annotation
 *      extraction is the enforcement point.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSchemas, type GenerateSchemasOptions } from "../generators/class-schema.js";

function generateSchemasOrThrow(options: Omit<GenerateSchemasOptions, "errorReporting">) {
  return generateSchemas({ ...options, errorReporting: "throw" });
}

function expectRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${message}: expected object, got ${typeof value}`);
  }
  return value as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Fixture sources
// ---------------------------------------------------------------------------

/**
 * Base interface carrying a type-level `@format`. A derived interface extends
 * it and adds/overrides only a constraint. The derived type's `$defs` entry
 * must inherit `format: "monetary-amount"`.
 */
const INTERFACE_INHERITANCE_SOURCE = [
  "/** @format monetary-amount */",
  "interface MonetaryAmount {",
  "  amount: number;",
  "  currency: string;",
  "}",
  "",
  "interface PositiveMonetaryAmount extends MonetaryAmount {",
  "  /** @exclusiveMinimum 0 */",
  "  amount: number;",
  "}",
  "",
  "export class Order {",
  "  subtotal!: MonetaryAmount;",
  "  tip!: PositiveMonetaryAmount;",
  "}",
].join("\n");

/**
 * Derived type overrides the base's `@format` — the override must win.
 */
const OVERRIDE_SOURCE = [
  "/** @format monetary-amount */",
  "interface MonetaryAmount {",
  "  amount: number;",
  "  currency: string;",
  "}",
  "",
  "/** @format strict-monetary-amount */",
  "interface StrictMonetaryAmount extends MonetaryAmount {",
  "  amount: number;",
  "}",
  "",
  "export class Order {",
  "  subtotal!: MonetaryAmount;",
  "  total!: StrictMonetaryAmount;",
  "}",
].join("\n");

/**
 * Class inheritance variant — ensures the fix applies to classes, not just
 * interfaces.
 */
const CLASS_INHERITANCE_SOURCE = [
  "/** @format monetary-amount */",
  "export class MonetaryAmount {",
  "  amount!: number;",
  "  currency!: string;",
  "}",
  "",
  "export class PositiveMonetaryAmount extends MonetaryAmount {",
  "  extraNote?: string;",
  "}",
  "",
  "export class Order {",
  "  subtotal!: MonetaryAmount;",
  "  tip!: PositiveMonetaryAmount;",
  "}",
].join("\n");

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let interfaceInheritanceFixturePath: string;
let overrideFixturePath: string;
let classInheritanceFixturePath: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-fmt-inherit-"));

  const tsconfig = JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "nodenext",
        strict: true,
        skipLibCheck: true,
      },
    },
    null,
    2
  );
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), tsconfig);

  interfaceInheritanceFixturePath = path.join(tmpDir, "interface-inheritance.ts");
  fs.writeFileSync(interfaceInheritanceFixturePath, INTERFACE_INHERITANCE_SOURCE);

  overrideFixturePath = path.join(tmpDir, "override.ts");
  fs.writeFileSync(overrideFixturePath, OVERRIDE_SOURCE);

  classInheritanceFixturePath = path.join(tmpDir, "class-inheritance.ts");
  fs.writeFileSync(classInheritanceFixturePath, CLASS_INHERITANCE_SOURCE);
});

afterAll(() => {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// Tests — issue #367 regression
// ---------------------------------------------------------------------------

describe("type-level @format inheritance on derived types — issue #367", () => {
  it("derived interface's $defs entry inherits @format from base", () => {
    const result = generateSchemasOrThrow({
      filePath: interfaceInheritanceFixturePath,
      typeName: "Order",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const base = expectRecord(defs["MonetaryAmount"], "$defs.MonetaryAmount");
    const derived = expectRecord(
      defs["PositiveMonetaryAmount"],
      "$defs.PositiveMonetaryAmount"
    );

    // spec: issue #367 — base-declared @format must flow to derived $defs entry.
    expect(base["format"]).toBe("monetary-amount");
    expect(derived["format"]).toBe("monetary-amount");
  });

  it("explicit @format on derived interface overrides inherited base format", () => {
    const result = generateSchemasOrThrow({
      filePath: overrideFixturePath,
      typeName: "Order",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const derived = expectRecord(
      defs["StrictMonetaryAmount"],
      "$defs.StrictMonetaryAmount"
    );

    // spec: issue #367 — explicit override wins over inherited annotation.
    expect(derived["format"]).toBe("strict-monetary-amount");
  });

  it("derived class's $defs entry inherits @format from base class", () => {
    const result = generateSchemasOrThrow({
      filePath: classInheritanceFixturePath,
      typeName: "Order",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const derived = expectRecord(
      defs["PositiveMonetaryAmount"],
      "$defs.PositiveMonetaryAmount"
    );

    // spec: issue #367 — the same semantics apply to class inheritance.
    expect(derived["format"]).toBe("monetary-amount");
  });
});
