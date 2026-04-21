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
 * Derived type overrides the base's `@format` — the override must win. A
 * third sibling type extends the base WITHOUT a local `@format`, and must
 * still inherit the base value in the same run. The sibling guards against
 * regressions where overrides and inheritance are collapsed into a single
 * "any local annotation wins" short-circuit.
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
  "interface SiblingMonetaryAmount extends MonetaryAmount {",
  "  label?: string;",
  "}",
  "",
  "export class Order {",
  "  subtotal!: MonetaryAmount;",
  "  total!: StrictMonetaryAmount;",
  "  sibling!: SiblingMonetaryAmount;",
  "}",
].join("\n");

/**
 * Multi-level chain: `Base ← Mid ← Leaf`. Only `Base` carries `@format`.
 * The leaf's `$defs` entry must transitively inherit the base's format
 * through the intermediate interface.
 */
const MULTI_LEVEL_SOURCE = [
  "/** @format monetary-amount */",
  "interface BaseMonetary {",
  "  amount: number;",
  "}",
  "",
  "interface MidMonetary extends BaseMonetary {",
  "  currency: string;",
  "}",
  "",
  "interface LeafMonetary extends MidMonetary {",
  "  label?: string;",
  "}",
  "",
  "export class Order {",
  "  leaf!: LeafMonetary;",
  "}",
].join("\n");

/**
 * `implements` does NOT propagate type-level annotations. A class that
 * `implements` an interface with `@format` must not inherit the format on
 * its own `$defs` entry.
 */
const IMPLEMENTS_NEGATIVE_SOURCE = [
  "/** @format monetary-amount */",
  "interface IMonetary {",
  "  amount: number;",
  "  currency: string;",
  "}",
  "",
  "export class PlainAmount implements IMonetary {",
  "  amount!: number;",
  "  currency!: string;",
  "}",
  "",
  "export class Order {",
  "  amount!: PlainAmount;",
  "}",
].join("\n");

/**
 * Cyclic inheritance — two interfaces extending each other. TypeScript
 * accepts this at the AST level (it only diagnoses at check time), so the
 * analyzer's BFS must not hang.
 */
const CYCLIC_SOURCE = [
  "/** @format monetary-amount */",
  "interface CycleA extends CycleB {",
  "  a: number;",
  "}",
  "",
  "interface CycleB extends CycleA {",
  "  b: number;",
  "}",
  "",
  "export class Order {",
  "  value!: CycleA;",
  "}",
].join("\n");

/**
 * Empty-value `@format` on the derived type — the base-declared value must
 * still flow through. An empty payload is not an override.
 *
 * Documented semantics (issue #367 review): a derived type whose `@format`
 * has no / whitespace-only value is treated as "no local override", so
 * heritage inheritance still fills in the base value.
 */
const EMPTY_OVERRIDE_SOURCE = [
  "/** @format monetary-amount */",
  "interface MonetaryAmount {",
  "  amount: number;",
  "  currency: string;",
  "}",
  "",
  "/** @format */",
  "interface EmptyOverrideAmount extends MonetaryAmount {",
  "  amount: number;",
  "}",
  "",
  "export class Order {",
  "  value!: EmptyOverrideAmount;",
  "}",
].join("\n");

/**
 * Diamond / multi-base conflict: interface `Derived extends Left, Right`
 * where both bases declare a different `@format`. BFS order is declaration
 * order in the `extends` clause — the first-listed base wins. Locks in
 * policy so a future refactor can't silently flip resolution order.
 */
const DIAMOND_CONFLICT_SOURCE = [
  "/** @format fmt-left */",
  "interface LeftBase {",
  "  amount: number;",
  "}",
  "",
  "/** @format fmt-right */",
  "interface RightBase {",
  "  amount: number;",
  "}",
  "",
  "interface Merged extends LeftBase, RightBase {",
  "  label?: string;",
  "}",
  "",
  "export class Order {",
  "  value!: Merged;",
  "}",
].join("\n");

/**
 * Negative: non-`@format` type-level annotations (e.g. `@remarks`) must NOT
 * inherit. The fix is deliberately scoped to `@format`; if a future change
 * broadens inheritance it should be an explicit decision, not a silent
 * regression.
 */
const NON_FORMAT_ANNOTATION_SOURCE = [
  "/**",
  " * @remarks base-level remarks that should not inherit",
  " */",
  "interface BaseWithRemarks {",
  "  amount: number;",
  "}",
  "",
  "interface DerivedNoAnnotation extends BaseWithRemarks {",
  "  label?: string;",
  "}",
  "",
  "export class Order {",
  "  value!: DerivedNoAnnotation;",
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
let multiLevelFixturePath: string;
let implementsNegativeFixturePath: string;
let cyclicFixturePath: string;
let emptyOverrideFixturePath: string;
let diamondConflictFixturePath: string;
let nonFormatAnnotationFixturePath: string;

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

  multiLevelFixturePath = path.join(tmpDir, "multi-level.ts");
  fs.writeFileSync(multiLevelFixturePath, MULTI_LEVEL_SOURCE);

  implementsNegativeFixturePath = path.join(tmpDir, "implements-negative.ts");
  fs.writeFileSync(implementsNegativeFixturePath, IMPLEMENTS_NEGATIVE_SOURCE);

  cyclicFixturePath = path.join(tmpDir, "cyclic.ts");
  fs.writeFileSync(cyclicFixturePath, CYCLIC_SOURCE);

  emptyOverrideFixturePath = path.join(tmpDir, "empty-override.ts");
  fs.writeFileSync(emptyOverrideFixturePath, EMPTY_OVERRIDE_SOURCE);

  diamondConflictFixturePath = path.join(tmpDir, "diamond-conflict.ts");
  fs.writeFileSync(diamondConflictFixturePath, DIAMOND_CONFLICT_SOURCE);

  nonFormatAnnotationFixturePath = path.join(tmpDir, "non-format-annotation.ts");
  fs.writeFileSync(nonFormatAnnotationFixturePath, NON_FORMAT_ANNOTATION_SOURCE);
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
    const derived = expectRecord(defs["PositiveMonetaryAmount"], "$defs.PositiveMonetaryAmount");

    // spec: issue #367 — base-declared @format must flow to derived $defs entry.
    expect(base["format"]).toBe("monetary-amount");
    expect(derived["format"]).toBe("monetary-amount");
  });

  it("explicit @format on derived interface overrides inherited base format, while a sibling with no local @format still inherits the base format", () => {
    const result = generateSchemasOrThrow({
      filePath: overrideFixturePath,
      typeName: "Order",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const derived = expectRecord(defs["StrictMonetaryAmount"], "$defs.StrictMonetaryAmount");
    const sibling = expectRecord(defs["SiblingMonetaryAmount"], "$defs.SiblingMonetaryAmount");

    // spec: issue #367 — explicit override wins over inherited annotation.
    expect(derived["format"]).toBe("strict-monetary-amount");
    // spec: issue #367 — sibling without a local @format must still inherit
    // the base value in the same run. Guards against regressions where the
    // override path short-circuits inheritance for all siblings.
    expect(sibling["format"]).toBe("monetary-amount");
  });

  it("derived class's $defs entry inherits @format from base class", () => {
    const result = generateSchemasOrThrow({
      filePath: classInheritanceFixturePath,
      typeName: "Order",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const derived = expectRecord(defs["PositiveMonetaryAmount"], "$defs.PositiveMonetaryAmount");

    // spec: issue #367 — the same semantics apply to class inheritance.
    expect(derived["format"]).toBe("monetary-amount");
  });

  it("transitively inherits @format across a multi-level heritage chain (Base ← Mid ← Leaf)", () => {
    const result = generateSchemasOrThrow({
      filePath: multiLevelFixturePath,
      typeName: "Order",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const leaf = expectRecord(defs["LeafMonetary"], "$defs.LeafMonetary");

    // spec: issue #367 — BFS walks the full heritage chain, so the leaf
    // inherits the base's @format through an intermediate interface that
    // carries no local annotation.
    expect(leaf["format"]).toBe("monetary-amount");
  });

  it("does not inherit @format from interfaces via `implements`", () => {
    const result = generateSchemasOrThrow({
      filePath: implementsNegativeFixturePath,
      typeName: "Order",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const plain = expectRecord(defs["PlainAmount"], "$defs.PlainAmount");

    // spec: issue #367 — `implements` carries no type-level annotation
    // inheritance. A class that implements an @format-tagged interface
    // must not emit that format on its own $defs entry.
    expect(plain["format"]).toBeUndefined();
  });

  it("terminates on cyclic heritage (interface A extends B extends A)", () => {
    // spec: issue #367 — BFS must terminate even if the heritage graph
    // contains a cycle (TS accepts cyclic extends at the AST level).
    const result = generateSchemasOrThrow({
      filePath: cyclicFixturePath,
      typeName: "Order",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const cycleA = expectRecord(defs["CycleA"], "$defs.CycleA");
    // The base annotation is on CycleA itself, so its own $defs entry
    // carries the format regardless of cycle traversal.
    expect(cycleA["format"]).toBe("monetary-amount");
  });

  it("treats an empty `@format` on the derived type as non-overriding (base value flows through)", () => {
    const result = generateSchemasOrThrow({
      filePath: emptyOverrideFixturePath,
      typeName: "Order",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const derived = expectRecord(defs["EmptyOverrideAmount"], "$defs.EmptyOverrideAmount");

    // spec: issue #367 — `@format` with no/whitespace payload is not a
    // local override; inheritance must still fill in the base value.
    expect(derived["format"]).toBe("monetary-amount");
  });

  it("resolves diamond / multi-base conflicts by declaration order (first-listed `extends` wins)", () => {
    const result = generateSchemasOrThrow({
      filePath: diamondConflictFixturePath,
      typeName: "Order",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const merged = expectRecord(defs["Merged"], "$defs.Merged");

    // spec: issue #367 — BFS walks `extends` clauses in source order, so
    // the first-listed base's @format wins. This test pins the policy so
    // a future refactor can't silently flip resolution order.
    expect(merged["format"]).toBe("fmt-left");
  });

  it("does not inherit non-`@format` type-level annotations (e.g. @remarks)", () => {
    // spec: issue #367 — the fix is deliberately scoped to @format.
    // Other type-level annotations must not start inheriting as a side
    // effect. Guards against accidental scope creep.
    const result = generateSchemasOrThrow({
      filePath: nonFormatAnnotationFixturePath,
      typeName: "Order",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const derived = expectRecord(defs["DerivedNoAnnotation"], "$defs.DerivedNoAnnotation");

    // @remarks on the base must not produce a description (or any inherited
    // annotation field) on the derived type's $defs entry.
    expect(derived["description"]).toBeUndefined();
    expect(derived["format"]).toBeUndefined();
  });
});
