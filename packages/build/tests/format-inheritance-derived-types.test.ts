/**
 * Regression tests for issue #367: type-level `@format` annotations declared
 * on a base interface must be inherited by derived interfaces / classes when
 * the derived type is emitted as a `$defs` entry. Explicit `@format` on the
 * derived type must win over the inherited value.
 *
 * @see https://github.com/mike-north/formspec/issues/367
 * @see https://github.com/mike-north/formspec/issues/374 — type-alias derivation coverage
 * @see https://github.com/mike-north/formspec/issues/376 — interface extends type-alias base (covered below)
 * @see https://github.com/mike-north/formspec/issues/383 — hybrid heritage + type-alias chains (covered below)
 * @see packages/build/src/analyzer/class-analyzer.ts — named-type annotation
 *      extraction is the enforcement point.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  generateSchemas,
  generateSchemasFromProgram,
  type GenerateSchemasOptions,
} from "../src/generators/class-schema.js";
import { analyzeInterfaceToIR } from "../src/analyzer/class-analyzer.js";
import { createProgramContextFromProgram, findInterfaceByName } from "../src/analyzer/program.js";
import { createExtensionRegistry } from "../src/extensions/index.js";
import { defineAnnotation, defineExtension } from "@formspec/core/internals";

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
 * Issue #381 multi-file fixture. The base declaration lives in `base.ts` and
 * the derived declaration lives in `host.ts`, matching the provenance bug
 * shape from the post-merge audit of #369. The inherited annotation must be
 * parsed against the base declaration's own source file, not the derived file.
 */
const MULTI_FILE_BASE_SOURCE = [
  "/** @format monetary-amount */",
  "export interface MonetaryAmount {",
  "  amount: number;",
  "  currency: string;",
  "}",
].join("\n");

const MULTI_FILE_HOST_SOURCE = [
  'import type { MonetaryAmount } from "./base.js";',
  "",
  "export interface PositiveAmount extends MonetaryAmount {",
  "  /** @exclusiveMinimum 0 */",
  "  amount: number;",
  "}",
  "",
  "export class Order {",
  "  total!: PositiveAmount;",
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

const CUSTOM_ANNOTATION_INHERITANCE_SOURCE = [
  "/** @displayCurrency USD */",
  "interface BaseMoney {",
  "  amount: number;",
  "}",
  "",
  "interface DerivedMoney extends BaseMoney {",
  "  amount: number;",
  "}",
  "",
  "/** @displayCurrency EUR */",
  "interface LocalMoney extends BaseMoney {",
  "  amount: number;",
  "}",
  "",
  "export class Order {",
  "  total!: DerivedMoney;",
  "  local!: LocalMoney;",
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
 * where both bases declare a different `@format` at the same BFS depth.
 *
 * The actual precedence rule enforced by `collectInheritedTypeAnnotations`
 * is **nearest annotation by BFS wins, with ties broken by declaration
 * order in the `extends` clause**. A shared `seen` set prevents the walker
 * from revisiting already-enqueued nodes, so annotations found at a
 * shallower depth always beat annotations deeper in the chain.
 *
 * This fixture is the symmetric case — both conflicting annotations live
 * at depth 1 — so declaration order determines the winner. The asymmetric
 * case (Case D, see {@link ASYMMETRIC_DIAMOND_SOURCE}) exercises the
 * depth dimension: a directly-listed-second base's annotation wins over
 * an annotation reachable only through the first-listed base.
 *
 * Locks in policy so a future refactor can't silently flip resolution.
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
 * Asymmetric diamond (Case D from issue #377). The first-listed base (B)
 * is itself un-annotated and reaches `@format deep-A` only via another
 * `extends` hop. The second-listed base (C) carries `@format direct-C`
 * directly. BFS-nearest-wins requires the directly-listed annotation to
 * beat the deeper ancestor despite the source-order position — guarding
 * against a future refactor that re-reads the documentation as
 * "first-listed wins in every case".
 */
const ASYMMETRIC_DIAMOND_SOURCE = [
  "/** @format deep-A */",
  "interface A {",
  "  amount: number;",
  "}",
  "",
  "interface B extends A {}",
  "",
  "/** @format direct-C */",
  "interface C {",
  "  amount: number;",
  "}",
  "",
  "interface D extends B, C {",
  "  label?: string;",
  "}",
  "",
  "export class Container {",
  "  tip!: D;",
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

/**
 * Issue #376 repro. Derived is an `interface extends TypeAlias` where the
 * base is a type-alias whose resolved type is object-shaped. The BFS in
 * `collectInheritedTypeAnnotations` must traverse the type-alias base so
 * that the derived interface inherits the alias-level `@format`.
 */
const INTERFACE_EXTENDS_TYPE_ALIAS_SOURCE = [
  "/** @format monetary-amount */",
  "type MonetaryAmount = { amount: number; currency: string };",
  "",
  "interface PositiveAmount extends MonetaryAmount {",
  "  /** @exclusiveMinimum 0 */",
  "  amount: number;",
  "}",
  "",
  "export class Order {",
  "  tip!: PositiveAmount;",
  "}",
].join("\n");

/**
 * Issue #376 — multi-level chain where the type-alias base sits in the
 * middle of the BFS. The BFS must cross the type-alias node to reach the
 * @format declared on a deeper base.
 */
const INTERFACE_EXTENDS_TYPE_ALIAS_MULTI_LEVEL_SOURCE = [
  "/** @format monetary-amount */",
  "interface BaseMonetary {",
  "  amount: number;",
  "}",
  "",
  "type AliasMonetary = BaseMonetary;",
  "",
  "interface LeafMonetary extends AliasMonetary {",
  "  currency: string;",
  "}",
  "",
  "export class Order {",
  "  tip!: LeafMonetary;",
  "}",
].join("\n");

/**
 * Deep 3-level alias chain: `L1 = string + @format email`, `L2 = L1`,
 * `L3 = L2`. Only `L1` carries the annotation. The field typed `L3` must
 * reach it transitively (issue #374).
 */
const TYPE_ALIAS_DEEP_CHAIN_SOURCE = [
  "/** @format email */",
  "type L1 = string;",
  "",
  "type L2 = L1;",
  "",
  "type L3 = L2;",
  "",
  "export class Container {",
  "  addr!: L3;",
  "}",
].join("\n");

/**
 * Cyclic annotation walk: `type CycleA = CycleB` where `CycleB` carries a
 * `@format` annotation. The alias chain forms a soft cycle (A → B → A via
 * the seen-set check) but the annotation walk must terminate after visiting
 * each alias once. `CycleB`'s object literal body stops the constraint
 * extractor from recursing, so only the annotation walk's seen-set is
 * exercised by this fixture.
 */
const TYPE_ALIAS_CYCLIC_SOURCE = [
  "/** @format cycle-b */",
  "type CycleB = { value: number };",
  "",
  "type CycleA = CycleB;",
  "",
  "export class Container {",
  "  value!: CycleA;",
  "}",
].join("\n");

/**
 * Intersection-body alias negative — stops the walk.
 *
 * `type Derived = Base & { extra: number }` is NOT a pass-through alias
 * because the body is a structural intersection, not a type reference.
 * The walker must NOT inherit `@format` from `Base`; the intersection is
 * treated as a new structural type. Guards the `ts.isTypeReferenceNode`
 * early-exit in `collectInheritedTypeAnnotations` / `enqueueBasesOf`.
 */
const TYPE_ALIAS_INTERSECTION_STOPS_WALK_SOURCE = [
  "/** @format monetary-amount */",
  "type BaseMoney = { amount: number };",
  "",
  "// Structural intersection — NOT a pass-through.",
  "type DerivedMoney = BaseMoney & { currency: string };",
  "",
  "export class Container {",
  "  value!: DerivedMoney;",
  "}",
].join("\n");

/**
 * #374 / #364 boundary fixture — alias with ONLY a path-targeted constraint
 * (`@minimum :amount 0`) and no inheritable type-level annotation must
 * collapse to the base's `$defs` entry so sibling-keyword composition
 * (issue #364, spec 003 §5.4) still resolves against the base. This locks
 * the reconciliation: alias identity is preserved only when an inheritable
 * type-level annotation (e.g. `@format`) is present on the alias chain.
 */
const TYPE_ALIAS_PATH_CONSTRAINT_ONLY_SOURCE = [
  "interface BaseMonetary {",
  "  amount: number;",
  "  currency: string;",
  "}",
  "",
  "/** @minimum :amount 0 */",
  "type PositiveMonetary = BaseMonetary;",
  "",
  "export class Form {",
  "  price!: PositiveMonetary;",
  "}",
].join("\n");

/**
 * Hybrid 2 (issue #383) — extends-then-alias. A derived interface extends
 * an `@format`-tagged base; a type alias then points at the derived
 * interface. The alias-chain walk must reach the derived interface and
 * continue through its heritage clause to inherit the base's annotation.
 */
const HYBRID_EXTENDS_THEN_ALIAS_SOURCE = [
  "/** @format monetary-amount */",
  "interface BaseMonetary {",
  "  amount: number;",
  "  currency: string;",
  "}",
  "",
  "interface DerivedMonetary extends BaseMonetary {",
  "  note?: string;",
  "}",
  "",
  "type AliasedDerived = DerivedMonetary;",
  "",
  "export class Order {",
  "  tip!: AliasedDerived;",
  "}",
].join("\n");

/**
 * Hybrid 3 (issue #383) — alias-then-implements (negative). A class
 * `implements` an alias of an `@format`-tagged interface. `implements`
 * never propagates type-level annotations (mirrors the
 * {@link IMPLEMENTS_NEGATIVE_SOURCE} fixture), so the alias indirection
 * must not change that result. Guards against a future change that
 * accidentally treats alias-of-interface in `implements` as a different
 * code path.
 */
const HYBRID_ALIAS_THEN_IMPLEMENTS_SOURCE = [
  "/** @format monetary-amount */",
  "interface IMonetary {",
  "  amount: number;",
  "  currency: string;",
  "}",
  "",
  "type AliasedBase = IMonetary;",
  "",
  "export class DerivedFromAlias implements AliasedBase {",
  "  amount!: number;",
  "  currency!: string;",
  "}",
  "",
  "export class Order {",
  "  amount!: DerivedFromAlias;",
  "}",
].join("\n");

/**
 * Generic pass-through alias — `type Box<T> = Container<T>`. The alias
 * body is a `TypeReferenceNode` with type arguments. The walker should
 * still reach `Container`'s `@format` annotation; the use-site
 * instantiated name (`Box<string>` vs `Container<string>`) is a separate
 * concern handled by `buildInstantiatedReferenceName`.
 */
const TYPE_ALIAS_GENERIC_PASS_THROUGH_SOURCE = [
  "/** @format boxed */",
  "interface Container<T> {",
  "  value: T;",
  "}",
  "",
  "type Box<T> = Container<T>;",
  "",
  "export class Shelf {",
  "  item!: Box<string>;",
  "}",
].join("\n");

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let interfaceInheritanceFixturePath: string;
let multiFileBaseFixturePath: string;
let multiFileHostFixturePath: string;
let overrideFixturePath: string;
let classInheritanceFixturePath: string;
let multiLevelFixturePath: string;
let customAnnotationInheritanceFixturePath: string;
let implementsNegativeFixturePath: string;
let cyclicFixturePath: string;
let emptyOverrideFixturePath: string;
let diamondConflictFixturePath: string;
let asymmetricDiamondFixturePath: string;
let nonFormatAnnotationFixturePath: string;
let bugReportVerbatimFixturePath: string;
let typeAliasPrimitiveChainFixturePath: string;
let typeAliasObjectChainFixturePath: string;
let typeAliasOfInterfaceFixturePath: string;
let typeAliasOwnOverrideFixturePath: string;
let interfaceExtendsTypeAliasFixturePath: string;
let interfaceExtendsTypeAliasMultiLevelFixturePath: string;
let typeAliasDeepChainFixturePath: string;
let typeAliasCyclicFixturePath: string;
let typeAliasIntersectionStopsWalkFixturePath: string;
let typeAliasPathConstraintOnlyFixturePath: string;
let typeAliasGenericPassThroughFixturePath: string;
let hybridExtendsThenAliasFixturePath: string;
let hybridAliasThenImplementsFixturePath: string;

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

  multiFileBaseFixturePath = path.join(tmpDir, "base.ts");
  fs.writeFileSync(multiFileBaseFixturePath, MULTI_FILE_BASE_SOURCE);

  multiFileHostFixturePath = path.join(tmpDir, "host.ts");
  fs.writeFileSync(multiFileHostFixturePath, MULTI_FILE_HOST_SOURCE);

  overrideFixturePath = path.join(tmpDir, "override.ts");
  fs.writeFileSync(overrideFixturePath, OVERRIDE_SOURCE);

  classInheritanceFixturePath = path.join(tmpDir, "class-inheritance.ts");
  fs.writeFileSync(classInheritanceFixturePath, CLASS_INHERITANCE_SOURCE);

  multiLevelFixturePath = path.join(tmpDir, "multi-level.ts");
  fs.writeFileSync(multiLevelFixturePath, MULTI_LEVEL_SOURCE);

  customAnnotationInheritanceFixturePath = path.join(tmpDir, "custom-annotation-inheritance.ts");
  fs.writeFileSync(customAnnotationInheritanceFixturePath, CUSTOM_ANNOTATION_INHERITANCE_SOURCE);

  implementsNegativeFixturePath = path.join(tmpDir, "implements-negative.ts");
  fs.writeFileSync(implementsNegativeFixturePath, IMPLEMENTS_NEGATIVE_SOURCE);

  cyclicFixturePath = path.join(tmpDir, "cyclic.ts");
  fs.writeFileSync(cyclicFixturePath, CYCLIC_SOURCE);

  emptyOverrideFixturePath = path.join(tmpDir, "empty-override.ts");
  fs.writeFileSync(emptyOverrideFixturePath, EMPTY_OVERRIDE_SOURCE);

  diamondConflictFixturePath = path.join(tmpDir, "diamond-conflict.ts");
  fs.writeFileSync(diamondConflictFixturePath, DIAMOND_CONFLICT_SOURCE);

  asymmetricDiamondFixturePath = path.join(tmpDir, "asymmetric-diamond.ts");
  fs.writeFileSync(asymmetricDiamondFixturePath, ASYMMETRIC_DIAMOND_SOURCE);

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

  interfaceExtendsTypeAliasFixturePath = path.join(tmpDir, "interface-extends-type-alias.ts");
  fs.writeFileSync(interfaceExtendsTypeAliasFixturePath, INTERFACE_EXTENDS_TYPE_ALIAS_SOURCE);

  interfaceExtendsTypeAliasMultiLevelFixturePath = path.join(
    tmpDir,
    "interface-extends-type-alias-multi-level.ts"
  );
  fs.writeFileSync(
    interfaceExtendsTypeAliasMultiLevelFixturePath,
    INTERFACE_EXTENDS_TYPE_ALIAS_MULTI_LEVEL_SOURCE
  );

  typeAliasDeepChainFixturePath = path.join(tmpDir, "type-alias-deep-chain.ts");
  fs.writeFileSync(typeAliasDeepChainFixturePath, TYPE_ALIAS_DEEP_CHAIN_SOURCE);

  typeAliasCyclicFixturePath = path.join(tmpDir, "type-alias-cyclic.ts");
  fs.writeFileSync(typeAliasCyclicFixturePath, TYPE_ALIAS_CYCLIC_SOURCE);

  typeAliasIntersectionStopsWalkFixturePath = path.join(
    tmpDir,
    "type-alias-intersection-stops-walk.ts"
  );
  fs.writeFileSync(
    typeAliasIntersectionStopsWalkFixturePath,
    TYPE_ALIAS_INTERSECTION_STOPS_WALK_SOURCE
  );

  typeAliasPathConstraintOnlyFixturePath = path.join(tmpDir, "type-alias-path-constraint-only.ts");
  fs.writeFileSync(typeAliasPathConstraintOnlyFixturePath, TYPE_ALIAS_PATH_CONSTRAINT_ONLY_SOURCE);

  typeAliasGenericPassThroughFixturePath = path.join(tmpDir, "type-alias-generic-pass-through.ts");
  fs.writeFileSync(typeAliasGenericPassThroughFixturePath, TYPE_ALIAS_GENERIC_PASS_THROUGH_SOURCE);

  hybridExtendsThenAliasFixturePath = path.join(tmpDir, "hybrid-extends-then-alias.ts");
  fs.writeFileSync(hybridExtendsThenAliasFixturePath, HYBRID_EXTENDS_THEN_ALIAS_SOURCE);

  hybridAliasThenImplementsFixturePath = path.join(tmpDir, "hybrid-alias-then-implements.ts");
  fs.writeFileSync(hybridAliasThenImplementsFixturePath, HYBRID_ALIAS_THEN_IMPLEMENTS_SOURCE);
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

  it("inherits @format across files and preserves base-file annotation provenance — issue #381", () => {
    const program = ts.createProgram({
      rootNames: [multiFileBaseFixturePath, multiFileHostFixturePath],
      options: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        strict: true,
        skipLibCheck: true,
      },
    });

    const result = generateSchemasFromProgram({
      program,
      filePath: multiFileHostFixturePath,
      typeName: "Order",
      errorReporting: "throw",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const derived = expectRecord(defs["PositiveAmount"], "$defs.PositiveAmount");

    // spec: issue #381 — schema generation must inherit the base-declared
    // format even when the base and derived declarations are in separate files.
    expect(derived["format"]).toBe("monetary-amount");

    const ctx = createProgramContextFromProgram(program, multiFileHostFixturePath);
    const positiveAmount = findInterfaceByName(ctx.sourceFile, "PositiveAmount");
    if (positiveAmount === null) throw new Error("PositiveAmount interface not found");

    const analysis = analyzeInterfaceToIR(positiveAmount, ctx.checker, multiFileHostFixturePath);
    const inheritedFormat = analysis.annotations?.find(
      (annotation) => annotation.annotationKind === "format"
    );

    // spec: issue #381 — inherited annotations must keep provenance anchored
    // to the base declaration's file. Using the derived file here would make
    // downstream diagnostics and source mapping point at the wrong module.
    expect(inheritedFormat).toMatchObject({
      annotationKind: "format",
      value: "monetary-amount",
      provenance: {
        file: multiFileBaseFixturePath,
      },
    });
    expect(inheritedFormat?.provenance.file).not.toBe(multiFileHostFixturePath);
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

  it("inherits extension custom annotations registered with local-wins", () => {
    const extensionRegistry = createExtensionRegistry([
      defineExtension({
        extensionId: "x-example/currency",
        annotations: [
          defineAnnotation({
            annotationName: "DisplayCurrency",
            inheritFromBase: "local-wins",
            toJsonSchema: (value, vendorPrefix) => ({
              [`${vendorPrefix}-display-currency`]: value,
            }),
          }),
        ],
      }),
    ]);
    const program = ts.createProgram({
      rootNames: [customAnnotationInheritanceFixturePath],
      options: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        strict: true,
        skipLibCheck: true,
      },
    });

    const result = generateSchemasFromProgram({
      program,
      filePath: customAnnotationInheritanceFixturePath,
      typeName: "Order",
      errorReporting: "throw",
      extensionRegistry,
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const derived = expectRecord(defs["DerivedMoney"], "$defs.DerivedMoney");
    const local = expectRecord(defs["LocalMoney"], "$defs.LocalMoney");

    expect(derived["x-formspec-display-currency"]).toBe("USD");
    expect(local["x-formspec-display-currency"]).toBe("EUR");

    const ctx = createProgramContextFromProgram(program, customAnnotationInheritanceFixturePath);
    const derivedMoney = findInterfaceByName(ctx.sourceFile, "DerivedMoney");
    if (derivedMoney === null) throw new Error("DerivedMoney interface not found");

    const analysis = analyzeInterfaceToIR(
      derivedMoney,
      ctx.checker,
      customAnnotationInheritanceFixturePath,
      extensionRegistry
    );
    const inheritedCurrency = analysis.annotations?.find(
      (annotation) =>
        annotation.annotationKind === "custom" &&
        annotation.annotationId === "x-example/currency/DisplayCurrency"
    );

    expect(inheritedCurrency).toMatchObject({
      annotationKind: "custom",
      annotationId: "x-example/currency/DisplayCurrency",
      value: "USD",
      provenance: {
        file: customAnnotationInheritanceFixturePath,
      },
    });
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

  it("resolves symmetric diamond conflicts by declaration order when both @format bases live at the same BFS depth", () => {
    const result = generateSchemasOrThrow({
      filePath: diamondConflictFixturePath,
      typeName: "Order",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const merged = expectRecord(defs["Merged"], "$defs.Merged");

    // spec: issue #367 / #377 — the precedence rule is "nearest annotation
    // by BFS wins, with ties broken by declaration order". In this
    // symmetric fixture both LeftBase and RightBase carry @format at
    // depth 1, so the tie-breaker (declaration order) decides:
    // LeftBase is listed first, so `fmt-left` wins. The asymmetric case
    // is pinned by the Case-D test below.
    expect(merged["format"]).toBe("fmt-left");
  });

  it("resolves asymmetric-diamond (Case D) conflicts by BFS depth — a directly-listed base's @format beats a deeper ancestor of an earlier-listed base", () => {
    // spec: issue #377 — corrects the precedence claim that said
    // "first-listed base wins". That claim only holds at equal depth.
    // When the conflicting annotations live at different BFS depths, the
    // nearer one wins regardless of declaration order. This is the
    // behavior the shared `seen` set enforces: once a node has been
    // enqueued it cannot be re-entered, so a shallower annotation
    // short-circuits the need set before the walker descends further.
    //
    // Fixture (Case D from the issue):
    //   /** @format deep-A */
    //   interface A {}
    //   interface B extends A {}        // no local annotation
    //   /** @format direct-C */
    //   interface C {}
    //   interface D extends B, C {}
    //
    // BFS from D enqueues [B, C] at depth 1. B has no annotation, so
    // processing moves on to C, which provides `@format direct-C` and
    // closes the need set — A at depth 2 is never visited. Expected:
    // `D.format === "direct-C"`, NOT "deep-A".
    const result = generateSchemasOrThrow({
      filePath: asymmetricDiamondFixturePath,
      typeName: "Container",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const d = expectRecord(defs["D"], "$defs.D");
    expect(d["format"]).toBe("direct-C");
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
// Tests — issue #376: interface extends a type-alias base
//
// PR #369 added the BFS walker for heritage-chain @format inheritance, but
// gated the enqueue step on `ClassDeclaration | InterfaceDeclaration` only.
// When the base in an `extends` clause resolves to a `TypeAliasDeclaration`
// (object-shaped), the walker silently dropped the base and no inherited
// annotation flowed through. See the post-merge-audit note on #369.
// ---------------------------------------------------------------------------

describe("interface extends a type-alias base — issue #376", () => {
  it("inherits @format from an object-shaped type-alias base in an interface `extends` clause", () => {
    // spec: issue #376 repro — `interface PositiveAmount extends MonetaryAmount`
    // where MonetaryAmount is `type MonetaryAmount = { ... }` carrying a
    // type-level `@format`. The BFS must follow the TypeAliasDeclaration
    // base so the derived interface's $defs entry picks up the annotation.
    const result = generateSchemasOrThrow({
      filePath: interfaceExtendsTypeAliasFixturePath,
      typeName: "Order",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const derived = expectRecord(defs["PositiveAmount"], "$defs.PositiveAmount");

    // Core assertion: the type-alias base's @format reaches the derived
    // interface's $defs entry.
    expect(derived["format"]).toBe("monetary-amount");
  });

  it("traverses a type-alias node mid-chain to reach an @format declared deeper in the heritage graph", () => {
    // spec: issue #376 — the fix must handle a type-alias sitting between
    // two heritage-bearing declarations, not just as an immediate base. Here
    // the chain is `LeafMonetary (interface) → AliasMonetary (type alias) →
    // BaseMonetary (interface, @format-tagged)`. The BFS must cross the
    // alias node to reach BaseMonetary.
    const result = generateSchemasOrThrow({
      filePath: interfaceExtendsTypeAliasMultiLevelFixturePath,
      typeName: "Order",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const leaf = expectRecord(defs["LeafMonetary"], "$defs.LeafMonetary");
    expect(leaf["format"]).toBe("monetary-amount");
  });
});

// ---------------------------------------------------------------------------
// Tests — type-alias derivation (issue #374)
//
// PR #369's heritage-chain BFS is gated on `HeritageClause`-bearing
// declarations (interfaces/classes). Issue #374 extended the inheritance
// walk to `type Foo = Bar` chains and registers pass-through type aliases
// as distinct `$defs` entries so derived alias identity is preserved.
// ---------------------------------------------------------------------------

describe("type-alias derivation — `@format` inheritance", () => {
  it("primitive alias chain: `type WorkEmail = BaseEmail` inherits `@format` from BaseEmail", () => {
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

  it("object-alias → object-alias: derived alias's $defs entry inherits base's `@format`", () => {
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

  it("type-alias of interface: the alias name is preserved as its own $defs entry carrying inherited `@format`", () => {
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

  it("derived type-alias with its own `@format` overrides the inherited base format", () => {
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

  it("deep 3-level alias chain (L1 → L2 → L3) transitively inherits `@format` from L1", () => {
    const result = generateSchemasOrThrow({
      filePath: typeAliasDeepChainFixturePath,
      typeName: "Container",
    });

    // spec: issue #374 — the walk must recurse past a single level. L3 has no
    // local annotation; L2 also has none; only L1 carries `@format email`.
    // The `addr` property should carry the format either inline or via a $ref
    // that resolves to a $defs entry carrying it.
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

    // spec: issue #374 — format must be reachable from the usage site, either
    // inline on the property or on the $defs entry the property references.
    expect(inlineFormat ?? defsFormat).toBe("email");
  });

  it("annotation walk terminates on a revisited alias (seen-set cycle guard) and inherits @format from the target", () => {
    // spec: issue #374 — the annotation walk's seen-set must prevent
    // revisiting already-walked aliases. `CycleA = CycleB` where `CycleB`
    // is an object literal alias (stops the constraint extractor from
    // recursing). The generator must complete and `CycleA`'s $defs entry
    // must carry the `@format` declared on `CycleB`.
    const result = generateSchemasOrThrow({
      filePath: typeAliasCyclicFixturePath,
      typeName: "Container",
    });

    const props = expectRecord(result.jsonSchema.properties ?? {}, "properties");
    const value = expectRecord(props["value"], "properties.value");
    expect(value["$ref"]).toBe("#/$defs/CycleA");

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const cycleA = expectRecord(defs["CycleA"], "$defs.CycleA");
    // spec: issue #374 — CycleB carries @format cycle-b; CycleA = CycleB
    // so the annotation walk must propagate it to CycleA's $defs entry.
    expect(cycleA["format"]).toBe("cycle-b");
  });

  it("intersection-body alias does NOT inherit @format from the base (walk stops at non-TypeReference RHS)", () => {
    // spec: issue #374 — only pass-through aliases (body is a direct
    // TypeReference) participate in annotation inheritance. Structural
    // intersections create a new type identity and must not pick up
    // the base's `@format`.
    const result = generateSchemasOrThrow({
      filePath: typeAliasIntersectionStopsWalkFixturePath,
      typeName: "Container",
    });

    const props = expectRecord(result.jsonSchema.properties ?? {}, "properties");
    const value = expectRecord(props["value"], "properties.value");

    // No inherited format should reach the property or any $defs entry
    // reachable from it. Accept either inline or through a $ref, but it
    // must not equal "monetary-amount".
    const defs = (result.jsonSchema.$defs ?? {}) as Record<string, Record<string, unknown>>;
    const inline = (value as { format?: string }).format;
    const refTarget =
      typeof (value as { $ref?: string }).$ref === "string" &&
      (value as { $ref: string }).$ref.startsWith("#/$defs/")
        ? (value as { $ref: string }).$ref.slice("#/$defs/".length)
        : undefined;
    const defsFormat = refTarget !== undefined ? defs[refTarget]?.["format"] : undefined;

    expect(inline).toBeUndefined();
    expect(defsFormat).toBeUndefined();
  });

  it("alias with only path-targeted constraints collapses to the base $ref — preserves #364 sibling composition", () => {
    // spec: issue #364 + issue #374 reconciliation. The alias carries only
    // a path-targeted constraint (`@minimum :amount 0`); no inheritable
    // type-level annotation is present on the chain. Identity preservation
    // must NOT trigger — the property's `$ref` must point at the base
    // (`BaseMonetary`) so sibling-keyword composition (spec 003 §5.4) can
    // attach the narrowing bound at the use site. See panel review in
    // PR #386 for the reconciliation rationale.
    const result = generateSchemasOrThrow({
      filePath: typeAliasPathConstraintOnlyFixturePath,
      typeName: "Form",
    });

    const props = expectRecord(result.jsonSchema.properties ?? {}, "properties");
    const price = expectRecord(props["price"], "properties.price");

    // Core assertion: `$ref` targets the base, not the alias.
    expect(price["$ref"]).toBe("#/$defs/BaseMonetary");
    // The path-targeted minimum rides as a sibling — guards #364's spec.
    expect(price["properties"]).toEqual({ amount: { minimum: 0 } });
    // And the base's $defs entry is present (dedup preserved).
    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    expect(defs).toHaveProperty("BaseMonetary");
    // No parallel alias entry is registered.
    expect(defs["PositiveMonetary"]).toBeUndefined();
  });

  it("generic pass-through alias inherits @format through the chain", () => {
    // spec: issue #374 — `type Box<T> = Container<T>` has a parameterized
    // TypeReference body. The walker reaches `Container`'s `@format`
    // annotation; identity preservation applies because an inheritable
    // type-level annotation is on the chain.
    const result = generateSchemasOrThrow({
      filePath: typeAliasGenericPassThroughFixturePath,
      typeName: "Shelf",
    });

    const props = expectRecord(result.jsonSchema.properties ?? {}, "properties");
    const item = expectRecord(props["item"], "properties.item");

    // The property must resolve to a $defs entry that carries the
    // inherited `@format boxed`. The exact name uses the
    // instantiated-reference form (e.g. `Box<string>` or
    // `Container<string>` depending on collapse) — accept either and
    // verify the reachable $defs entry carries the format.
    const ref = (item as { $ref?: string }).$ref;
    expect(typeof ref).toBe("string");
    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const refTarget = ref?.startsWith("#/$defs/") ? ref.slice("#/$defs/".length) : undefined;
    expect(refTarget).toBeDefined();
    const entry = expectRecord(defs[refTarget ?? ""], `$defs.${refTarget ?? "(unknown)"}`);
    expect(entry["format"]).toBe("boxed");
  });
});

// ---------------------------------------------------------------------------
// Tests — hybrid heritage + type-alias chains (issue #383)
//
// Hybrid chains mix `interface extends` / `class extends` with `type` alias
// derivation in a single inheritance path. The unified BFS in
// `collectInheritedTypeAnnotations` crosses alias boundaries in both
// directions, so these tests pin the composition.
//
// Issue #383's "Hybrid 1" (alias-then-extends, `interface Derived extends
// AliasedBase` where `AliasedBase = SomeInterface`) is structurally the
// same path already pinned by `INTERFACE_EXTENDS_TYPE_ALIAS_MULTI_LEVEL_SOURCE`
// above — no separate fixture needed. Issue #383's parenthetical "class
// extends AliasedBase" arm is not testable: TypeScript rejects
// `class extends type-alias` (TS2693, "only refers to a type"), so a
// type-alias cannot appear in a class's heritage clause regardless of
// whether the alias resolves to a class or interface. The remaining
// hybrid chains are pinned below.
// ---------------------------------------------------------------------------

describe("hybrid heritage + type-alias chains — issue #383", () => {
  it("extends-then-alias: alias of a derived interface inherits the @format from the interface's base", () => {
    // spec: issue #383 Hybrid 2 — chain is `AliasedDerived (alias) →
    // DerivedMonetary (interface) extends BaseMonetary (interface,
    // @format-tagged)`. The alias-chain walker must reach the derived
    // interface, then continue through its heritage clause to pick up
    // the base's annotation.
    const result = generateSchemasOrThrow({
      filePath: hybridExtendsThenAliasFixturePath,
      typeName: "Order",
    });

    const props = expectRecord(result.jsonSchema.properties ?? {}, "properties");
    const tip = expectRecord(props["tip"], "properties.tip");
    // The alias preserves identity because an inheritable type-level
    // annotation is reachable on the chain.
    expect(tip["$ref"]).toBe("#/$defs/AliasedDerived");

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const aliased = expectRecord(defs["AliasedDerived"], "$defs.AliasedDerived");
    expect(aliased["format"]).toBe("monetary-amount");
  });

  it("alias-then-implements (negative): a class that `implements` an alias of an @format-tagged interface does NOT inherit the format", () => {
    // spec: issue #383 Hybrid 3 — `implements` never propagates
    // type-level annotations (locked in by IMPLEMENTS_NEGATIVE_SOURCE
    // for the non-hybrid case). The alias indirection must not change
    // that result. Guards against a future change that mistakenly
    // routes alias-of-interface bases through the inheritance walker
    // for `implements` clauses.
    const result = generateSchemasOrThrow({
      filePath: hybridAliasThenImplementsFixturePath,
      typeName: "Order",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const derived = expectRecord(defs["DerivedFromAlias"], "$defs.DerivedFromAlias");

    expect(derived["format"]).toBeUndefined();
  });
});
