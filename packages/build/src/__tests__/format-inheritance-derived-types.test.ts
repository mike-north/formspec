/**
 * Regression tests for issue #367: type-level `@format` annotations declared
 * on a base interface must be inherited by derived interfaces / classes when
 * the derived type is emitted as a `$defs` entry. Explicit `@format` on the
 * derived type must win over the inherited value.
 *
 * @see https://github.com/mike-north/formspec/issues/367
 * @see https://github.com/mike-north/formspec/issues/374 — type-alias derivation gap (skipped tests below)
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

/**
 * Verbatim reproduction of the code in issue #367's "Reproduction" section
 * (with `Decimal`/`Currency` replaced by `number`/`string` to keep the
 * fixture free of extension-registered custom types). The root container
 * is the same `MinAmountConfig` interface the bug report uses, and the
 * derived type narrows `amount` with a property-level constraint
 * (`@exclusiveMinimum 0`) in the same declaration that the bug says loses
 * its inherited `@format`.
 *
 * Guards three things the bug report binds together that the generic
 * fixtures above test only individually:
 *
 * 1. The derived `$defs` entry carries the base's `format`.
 * 2. The property-level constraint added on the derived type
 *    (`@exclusiveMinimum 0` on `amount`) is preserved in the same run —
 *    a regression that keeps `format` but drops the narrowing constraint
 *    would silently re-introduce the bug the derived-type pattern was
 *    chosen to avoid.
 * 3. The usage site emits a `$ref` to the derived definition, so
 *    downstream renderers that follow `$ref` land on an entry that has
 *    both `format` and the narrowed constraint.
 */
const BUG_REPORT_VERBATIM_SOURCE = [
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
  "// The bug report's container is `export interface MinAmountConfig { ... }`.",
  "// This file's convention is class roots (generateSchemas takes a class name).",
  "// Using a class root changes nothing about the derived-type inheritance path",
  "// under test — the heritage chain on PositiveMonetaryAmount is what matters.",
  "export class MinAmountConfig {",
  "  minimumAmount!: PositiveMonetaryAmount;",
  "}",
].join("\n");

/**
 * Fixtures for the type-alias-derivation gap (skipped tests). Each fixture
 * mirrors the bug-report shape but expresses the derivation through a
 * `type` alias rather than an `interface extends` clause. PR #369's
 * heritage-chain BFS is gated on `HeritageClause`-bearing declarations and
 * does not run for type aliases, so each scenario below currently drops
 * the `@format` annotation somewhere between the base declaration and the
 * generated schema. The skipped tests assert the target behavior; they
 * become the acceptance criterion for a future fix.
 */

/** Primitive-alias chain: `BaseEmail` (string + `@format email`) → `WorkEmail`. */
const TYPE_ALIAS_PRIMITIVE_CHAIN_SOURCE = [
  "/** @format email */",
  "type BaseEmail = string;",
  "",
  "type WorkEmail = BaseEmail;",
  "",
  "export class Container {",
  "  addr!: WorkEmail;",
  "}",
].join("\n");

/** Object-literal alias → object-literal alias, no local override on derived. */
const TYPE_ALIAS_OBJECT_CHAIN_SOURCE = [
  "/** @format monetary-amount */",
  "type MonetaryAmount = { amount: number; currency: string };",
  "",
  "type PositiveMonetaryAmount = MonetaryAmount;",
  "",
  "export class Container {",
  "  value!: PositiveMonetaryAmount;",
  "}",
].join("\n");

/**
 * Type alias of an interface — the alias name should be preserved as its
 * own `$defs` entry that inherits the base's `@format`, not silently
 * resolved to the interface's entry.
 */
const TYPE_ALIAS_OF_INTERFACE_SOURCE = [
  "/** @format monetary-amount */",
  "interface MonetaryAmount {",
  "  amount: number;",
  "  currency: string;",
  "}",
  "",
  "type AliasedMonetary = MonetaryAmount;",
  "",
  "export class Container {",
  "  value!: AliasedMonetary;",
  "}",
].join("\n");

/**
 * Chain with a local `@format` on the derived alias — the override must
 * win over the inherited value, just as it does for interface-extends.
 */
const TYPE_ALIAS_OWN_OVERRIDE_SOURCE = [
  "/** @format monetary-amount */",
  "type MonetaryAmount = { amount: number; currency: string };",
  "",
  "/** @format positive-monetary-amount */",
  "type PositiveMonetaryAmount = MonetaryAmount;",
  "",
  "export class Container {",
  "  value!: PositiveMonetaryAmount;",
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
let bugReportVerbatimFixturePath: string;
let typeAliasPrimitiveChainFixturePath: string;
let typeAliasObjectChainFixturePath: string;
let typeAliasOfInterfaceFixturePath: string;
let typeAliasOwnOverrideFixturePath: string;

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

  bugReportVerbatimFixturePath = path.join(tmpDir, "bug-report-verbatim.ts");
  fs.writeFileSync(bugReportVerbatimFixturePath, BUG_REPORT_VERBATIM_SOURCE);

  typeAliasPrimitiveChainFixturePath = path.join(tmpDir, "type-alias-primitive-chain.ts");
  fs.writeFileSync(typeAliasPrimitiveChainFixturePath, TYPE_ALIAS_PRIMITIVE_CHAIN_SOURCE);

  typeAliasObjectChainFixturePath = path.join(tmpDir, "type-alias-object-chain.ts");
  fs.writeFileSync(typeAliasObjectChainFixturePath, TYPE_ALIAS_OBJECT_CHAIN_SOURCE);

  typeAliasOfInterfaceFixturePath = path.join(tmpDir, "type-alias-of-interface.ts");
  fs.writeFileSync(typeAliasOfInterfaceFixturePath, TYPE_ALIAS_OF_INTERFACE_SOURCE);

  typeAliasOwnOverrideFixturePath = path.join(tmpDir, "type-alias-own-override.ts");
  fs.writeFileSync(typeAliasOwnOverrideFixturePath, TYPE_ALIAS_OWN_OVERRIDE_SOURCE);
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

// ---------------------------------------------------------------------------
// Tests — bug-report verbatim scenario
//
// Issue #367's repro binds two concerns together: the derived type adds a
// property-level constraint (`@exclusiveMinimum 0` on `amount`) AND the
// base's `@format` must survive on the derived type. The generic fixtures
// above assert each concern individually; this test asserts them in a
// single run against the issue's own declaration shape, and adds the
// `$ref` reference-site assertion that the issue's expected output shows.
// ---------------------------------------------------------------------------

describe("issue #367 — bug-report verbatim scenario", () => {
  it("emits inherited @format AND preserves the derived type's narrowing constraint, with a $ref at the usage site", () => {
    const result = generateSchemasOrThrow({
      filePath: bugReportVerbatimFixturePath,
      typeName: "MinAmountConfig",
    });

    // spec: issue #367 "Expected output" — the usage site emits a $ref to
    // the derived definition, not an inline schema. Downstream renderers
    // resolve the $ref and read `format` off the target.
    const props = expectRecord(result.jsonSchema.properties ?? {}, "properties");
    const minimumAmount = expectRecord(props["minimumAmount"], "properties.minimumAmount");
    expect(minimumAmount["$ref"]).toBe("#/$defs/PositiveMonetaryAmount");

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const derived = expectRecord(defs["PositiveMonetaryAmount"], "$defs.PositiveMonetaryAmount");

    // spec: issue #367 — base-declared @format must flow to derived $defs
    // entry. This is the core bug.
    expect(derived["format"]).toBe("monetary-amount");

    // spec: issue #367 binds the format-inheritance fix to the
    // derived-type-narrowing pattern (the "recommended pattern for
    // constraining MonetaryAmount fields"). The property-level
    // `@exclusiveMinimum 0` declared on the derived type's `amount` must
    // survive in the same run — a regression that kept `format` while
    // dropping the narrowing constraint would silently re-introduce the
    // failure mode the derived-type pattern was chosen to avoid.
    const derivedProps = expectRecord(
      derived["properties"] ?? {},
      "$defs.PositiveMonetaryAmount.properties"
    );
    const amount = expectRecord(
      derivedProps["amount"],
      "$defs.PositiveMonetaryAmount.properties.amount"
    );
    expect(amount["exclusiveMinimum"]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — type-alias derivation gap (skipped / future work)
//
// PR #369's heritage-chain BFS is gated on `HeritageClause`-bearing
// declarations (interfaces/classes). Type aliases have no heritage clauses,
// so the fix never runs for them. Each skipped test asserts the target
// behavior so a future implementation has an unambiguous acceptance
// criterion — unskip and verify, no new test authoring required.
//
// See https://github.com/mike-north/formspec/issues/374 (filed alongside
// this test file) for the tracking issue.
// ---------------------------------------------------------------------------

describe("type-alias derivation — `@format` inheritance gap (future work)", () => {
  it.skip("primitive alias chain: `type WorkEmail = BaseEmail` inherits `@format` from BaseEmail", () => {
    const result = generateSchemasOrThrow({
      filePath: typeAliasPrimitiveChainFixturePath,
      typeName: "Container",
    });

    // Target: either the derived alias gets its own $defs entry carrying
    // the inherited format, or the property emits `format` inline. Either
    // shape is acceptable; today neither occurs (format is dropped
    // entirely).
    const props = expectRecord(result.jsonSchema.properties ?? {}, "properties");
    const addr = expectRecord(props["addr"], "properties.addr");
    const defs = result.jsonSchema.$defs as Record<string, { format?: string }> | undefined;

    const inlineFormat = (addr as { format?: string }).format;
    const refTarget =
      typeof (addr as { $ref?: string }).$ref === "string" &&
      (addr as { $ref: string }).$ref.startsWith("#/$defs/")
        ? (addr as { $ref: string }).$ref.slice("#/$defs/".length)
        : undefined;
    const defsFormat = refTarget !== undefined ? defs?.[refTarget]?.format : undefined;

    expect(inlineFormat ?? defsFormat).toBe("email");
  });

  it.skip("object-alias → object-alias: derived alias's $defs entry inherits base's `@format`", () => {
    const result = generateSchemasOrThrow({
      filePath: typeAliasObjectChainFixturePath,
      typeName: "Container",
    });

    // Target: PositiveMonetaryAmount is registered in $defs as its own
    // entity (derived alias identity preserved) and carries the base's
    // format. Today the derived alias is erased and the property's $ref
    // points directly at MonetaryAmount.
    const props = expectRecord(result.jsonSchema.properties ?? {}, "properties");
    const value = expectRecord(props["value"], "properties.value");
    expect(value["$ref"]).toBe("#/$defs/PositiveMonetaryAmount");

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const derived = expectRecord(defs["PositiveMonetaryAmount"], "$defs.PositiveMonetaryAmount");
    expect(derived["format"]).toBe("monetary-amount");
  });

  it.skip("type-alias of interface: the alias name is preserved as its own $defs entry carrying inherited `@format`", () => {
    const result = generateSchemasOrThrow({
      filePath: typeAliasOfInterfaceFixturePath,
      typeName: "Container",
    });

    // Target: AliasedMonetary gets its own $defs entry that carries the
    // base interface's format. Today AliasedMonetary collapses into
    // MonetaryAmount — the format is user-visible by accident, but the
    // alias identity is lost (breaks any consumer that expects $defs to
    // reflect the declared alias names).
    const props = expectRecord(result.jsonSchema.properties ?? {}, "properties");
    const value = expectRecord(props["value"], "properties.value");
    expect(value["$ref"]).toBe("#/$defs/AliasedMonetary");

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const aliased = expectRecord(defs["AliasedMonetary"], "$defs.AliasedMonetary");
    expect(aliased["format"]).toBe("monetary-amount");
  });

  it.skip("derived type-alias with its own `@format` overrides the inherited base format", () => {
    const result = generateSchemasOrThrow({
      filePath: typeAliasOwnOverrideFixturePath,
      typeName: "Container",
    });

    // Target: derived alias keeps its identity AND its own @format wins.
    // Today both the derived alias name and its annotation are dropped —
    // the property's $ref points at the base and emits the base's format.
    const props = expectRecord(result.jsonSchema.properties ?? {}, "properties");
    const value = expectRecord(props["value"], "properties.value");
    expect(value["$ref"]).toBe("#/$defs/PositiveMonetaryAmount");

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const derived = expectRecord(defs["PositiveMonetaryAmount"], "$defs.PositiveMonetaryAmount");
    expect(derived["format"]).toBe("positive-monetary-amount");
  });
});
