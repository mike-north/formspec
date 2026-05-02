/**
 * Regression tests for issue #380: type-level `@deprecated` annotations
 * declared on a base type must be inherited by derived declarations that opt
 * in through `extends` or type-alias derivation. Local non-empty
 * `@deprecated` messages win; presence-only and whitespace-only tags do not
 * suppress the inherited message.
 *
 * @see https://github.com/mike-north/formspec/issues/380
 * @see packages/analysis/src/heritage-annotations.ts — inheritance walk and
 *      local override detection.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as ts from "typescript";
import type { AnnotationNode, DeprecatedAnnotationNode } from "@formspec/core/internals";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeClassToIR, analyzeInterfaceToIR } from "../src/analyzer/class-analyzer.js";
import {
  createProgramContextFromProgram,
  findClassByName,
  findInterfaceByName,
} from "../src/analyzer/program.js";
import { generateSchemas, type GenerateSchemasOptions } from "../src/generators/class-schema.js";

function generateSchemasOrThrow(options: Omit<GenerateSchemasOptions, "errorReporting">) {
  return generateSchemas({ ...options, errorReporting: "throw" });
}

function expectRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${message}: expected object, got ${typeof value}`);
  }
  return value as Record<string, unknown>;
}

function expectDeprecatedAnnotation(
  annotations: readonly AnnotationNode[] | undefined,
  message: string
): DeprecatedAnnotationNode {
  const deprecated = annotations?.find(
    (annotation): annotation is DeprecatedAnnotationNode =>
      annotation.annotationKind === "deprecated"
  );
  expect(deprecated).toMatchObject({
    annotationKind: "deprecated",
    message,
  });
  if (deprecated === undefined) {
    throw new Error(`Expected @deprecated annotation with message "${message}"`);
  }
  return deprecated;
}

function expectNoDeprecatedAnnotation(annotations: readonly AnnotationNode[] | undefined): void {
  expect(
    annotations?.some((annotation) => annotation.annotationKind === "deprecated") ?? false
  ).toBe(false);
}

function expectDeprecatedSchema(schema: Record<string, unknown>, message: string): void {
  expect(schema["deprecated"]).toBe(true);
  expect(schema["x-formspec-deprecation-description"]).toBe(message);
}

const EXTENDS_INHERITANCE_SOURCE = [
  "/** @deprecated Use CustomerV2 instead */",
  "interface DeprecatedCustomer {",
  "  id: string;",
  "}",
  "",
  "interface DerivedCustomer extends DeprecatedCustomer {",
  "  email?: string;",
  "}",
  "",
  "export class Form {",
  "  value!: DerivedCustomer;",
  "}",
].join("\n");

const MULTI_LEVEL_SOURCE = [
  "/** @deprecated Use RootV2 instead */",
  "interface RootCustomer {",
  "  id: string;",
  "}",
  "",
  "interface MidCustomer extends RootCustomer {",
  "  tier?: string;",
  "}",
  "",
  "interface LeafCustomer extends MidCustomer {",
  "  email?: string;",
  "}",
  "",
  "export class Form {",
  "  value!: LeafCustomer;",
  "}",
].join("\n");

const NEAREST_ANCESTOR_SOURCE = [
  "/** @deprecated Use RootV2 instead */",
  "interface RootCustomer {",
  "  id: string;",
  "}",
  "",
  "/** @deprecated Use MidV2 instead */",
  "interface MidCustomer extends RootCustomer {",
  "  tier?: string;",
  "}",
  "",
  "interface LeafCustomer extends MidCustomer {",
  "  email?: string;",
  "}",
  "",
  "export class Form {",
  "  value!: LeafCustomer;",
  "}",
].join("\n");

const TYPE_ALIAS_CHAIN_SOURCE = [
  "/** @deprecated Use CustomerV2 instead */",
  "interface DeprecatedCustomer {",
  "  id: string;",
  "}",
  "",
  "type AliasedCustomer = DeprecatedCustomer;",
  "",
  "interface DerivedCustomer extends AliasedCustomer {",
  "  email?: string;",
  "}",
  "",
  "export class Form {",
  "  value!: DerivedCustomer;",
  "}",
].join("\n");

const TYPE_ALIAS_PRESENCE_ONLY_SOURCE = [
  "interface Customer {",
  "  id: string;",
  "}",
  "",
  "/** @deprecated */",
  "type OldCustomer = Customer;",
  "",
  "export class Form {",
  "  value!: OldCustomer;",
  "}",
].join("\n");

const LOCAL_OVERRIDE_SOURCE = [
  "/** @deprecated Use BaseV2 instead */",
  "interface DeprecatedCustomer {",
  "  id: string;",
  "}",
  "",
  "/** @deprecated Use SpecificCustomerV2 instead */",
  "interface SpecificCustomer extends DeprecatedCustomer {",
  "  email?: string;",
  "}",
  "",
  "export class Form {",
  "  value!: SpecificCustomer;",
  "}",
].join("\n");

const EMPTY_OVERRIDE_SOURCE = [
  "/** @deprecated Use BaseV2 instead */",
  "interface DeprecatedCustomer {",
  "  id: string;",
  "}",
  "",
  "/** @deprecated */",
  "interface PresenceOnlyCustomer extends DeprecatedCustomer {",
  "  email?: string;",
  "}",
  "",
  "export class Form {",
  "  value!: PresenceOnlyCustomer;",
  "}",
].join("\n");

const WHITESPACE_OVERRIDE_SOURCE = [
  "/** @deprecated Use BaseV2 instead */",
  "interface DeprecatedCustomer {",
  "  id: string;",
  "}",
  "",
  "/** @deprecated    */",
  "interface WhitespaceOnlyCustomer extends DeprecatedCustomer {",
  "  email?: string;",
  "}",
  "",
  "export class Form {",
  "  value!: WhitespaceOnlyCustomer;",
  "}",
].join("\n");

const CLASS_EXTENDS_SOURCE = [
  "/** @deprecated Use CustomerBaseV2 instead */",
  "class DeprecatedCustomerBase {",
  "  id!: string;",
  "}",
  "",
  "class DerivedCustomer extends DeprecatedCustomerBase {",
  "  email?: string;",
  "}",
  "",
  "export class Form {",
  "  value!: DerivedCustomer;",
  "}",
].join("\n");

const BASE_PRESENCE_ONLY_SOURCE = [
  "/** @deprecated */",
  "interface DeprecatedCustomer {",
  "  id: string;",
  "}",
  "",
  "interface DerivedCustomer extends DeprecatedCustomer {",
  "  email?: string;",
  "}",
  "",
  "export class Form {",
  "  value!: DerivedCustomer;",
  "}",
].join("\n");

const IMPLEMENTS_NEGATIVE_SOURCE = [
  "/** @deprecated Use ICustomerV2 instead */",
  "interface DeprecatedCustomer {",
  "  id: string;",
  "}",
  "",
  "class StructuralCustomer implements DeprecatedCustomer {",
  "  id!: string;",
  "}",
  "",
  "export class Form {",
  "  value!: StructuralCustomer;",
  "}",
].join("\n");

const NO_HERITAGE_SOURCE = [
  "class StandaloneCustomer {",
  "  id!: string;",
  "}",
  "",
  "export class Form {",
  "  value!: StandaloneCustomer;",
  "}",
].join("\n");

let tmpDir: string;
let extendsInheritanceFixturePath: string;
let multiLevelFixturePath: string;
let nearestAncestorFixturePath: string;
let typeAliasChainFixturePath: string;
let typeAliasPresenceOnlyFixturePath: string;
let localOverrideFixturePath: string;
let emptyOverrideFixturePath: string;
let whitespaceOverrideFixturePath: string;
let classExtendsFixturePath: string;
let basePresenceOnlyFixturePath: string;
let implementsNegativeFixturePath: string;
let noHeritageFixturePath: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-deprecated-inherit-"));

  fs.writeFileSync(
    path.join(tmpDir, "tsconfig.json"),
    JSON.stringify(
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
    )
  );

  extendsInheritanceFixturePath = path.join(tmpDir, "extends-inheritance.ts");
  fs.writeFileSync(extendsInheritanceFixturePath, EXTENDS_INHERITANCE_SOURCE);

  multiLevelFixturePath = path.join(tmpDir, "multi-level.ts");
  fs.writeFileSync(multiLevelFixturePath, MULTI_LEVEL_SOURCE);

  nearestAncestorFixturePath = path.join(tmpDir, "nearest-ancestor.ts");
  fs.writeFileSync(nearestAncestorFixturePath, NEAREST_ANCESTOR_SOURCE);

  typeAliasChainFixturePath = path.join(tmpDir, "type-alias-chain.ts");
  fs.writeFileSync(typeAliasChainFixturePath, TYPE_ALIAS_CHAIN_SOURCE);

  typeAliasPresenceOnlyFixturePath = path.join(tmpDir, "type-alias-presence-only.ts");
  fs.writeFileSync(typeAliasPresenceOnlyFixturePath, TYPE_ALIAS_PRESENCE_ONLY_SOURCE);

  localOverrideFixturePath = path.join(tmpDir, "local-override.ts");
  fs.writeFileSync(localOverrideFixturePath, LOCAL_OVERRIDE_SOURCE);

  emptyOverrideFixturePath = path.join(tmpDir, "empty-override.ts");
  fs.writeFileSync(emptyOverrideFixturePath, EMPTY_OVERRIDE_SOURCE);

  whitespaceOverrideFixturePath = path.join(tmpDir, "whitespace-override.ts");
  fs.writeFileSync(whitespaceOverrideFixturePath, WHITESPACE_OVERRIDE_SOURCE);

  classExtendsFixturePath = path.join(tmpDir, "class-extends.ts");
  fs.writeFileSync(classExtendsFixturePath, CLASS_EXTENDS_SOURCE);

  basePresenceOnlyFixturePath = path.join(tmpDir, "base-presence-only.ts");
  fs.writeFileSync(basePresenceOnlyFixturePath, BASE_PRESENCE_ONLY_SOURCE);

  implementsNegativeFixturePath = path.join(tmpDir, "implements-negative.ts");
  fs.writeFileSync(implementsNegativeFixturePath, IMPLEMENTS_NEGATIVE_SOURCE);

  noHeritageFixturePath = path.join(tmpDir, "no-heritage.ts");
  fs.writeFileSync(noHeritageFixturePath, NO_HERITAGE_SOURCE);
});

afterAll(() => {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

describe("type-level @deprecated inheritance on derived types — issue #380", () => {
  it("inherits @deprecated from a base interface through single-level extends", () => {
    const result = generateSchemasOrThrow({
      filePath: extendsInheritanceFixturePath,
      typeName: "Form",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const derived = expectRecord(defs["DerivedCustomer"], "$defs.DerivedCustomer");

    expectDeprecatedSchema(derived, "Use CustomerV2 instead");

    const program = ts.createProgram({
      rootNames: [extendsInheritanceFixturePath],
      options: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        strict: true,
        skipLibCheck: true,
      },
    });
    const ctx = createProgramContextFromProgram(program, extendsInheritanceFixturePath);
    const derivedCustomer = findInterfaceByName(ctx.sourceFile, "DerivedCustomer");
    if (derivedCustomer === null) throw new Error("DerivedCustomer interface not found");

    const analysis = analyzeInterfaceToIR(
      derivedCustomer,
      ctx.checker,
      extendsInheritanceFixturePath
    );
    expectDeprecatedAnnotation(analysis.annotations, "Use CustomerV2 instead");
  });

  it("walks a multi-level extends chain with nearest deprecated ancestor winning", () => {
    const result = generateSchemasOrThrow({
      filePath: multiLevelFixturePath,
      typeName: "Form",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const leaf = expectRecord(defs["LeafCustomer"], "$defs.LeafCustomer");

    expectDeprecatedSchema(leaf, "Use RootV2 instead");
  });

  it("prefers the nearest ancestor's @deprecated message in a multi-level extends chain", () => {
    const result = generateSchemasOrThrow({
      filePath: nearestAncestorFixturePath,
      typeName: "Form",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const leaf = expectRecord(defs["LeafCustomer"], "$defs.LeafCustomer");

    expectDeprecatedSchema(leaf, "Use MidV2 instead");
  });

  it("inherits @deprecated through an interface-extends-type-alias derivation chain", () => {
    const result = generateSchemasOrThrow({
      filePath: typeAliasChainFixturePath,
      typeName: "Form",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const derived = expectRecord(defs["DerivedCustomer"], "$defs.DerivedCustomer");

    expectDeprecatedSchema(derived, "Use CustomerV2 instead");
  });

  it("preserves pass-through aliases with presence-only @deprecated as deprecated definitions", () => {
    const result = generateSchemasOrThrow({
      filePath: typeAliasPresenceOnlyFixturePath,
      typeName: "Form",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const oldCustomer = expectRecord(defs["OldCustomer"], "$defs.OldCustomer");

    expect(oldCustomer["deprecated"]).toBe(true);
    expect(oldCustomer["x-formspec-deprecation-description"]).toBeUndefined();
  });

  it("lets a local non-empty @deprecated message override the inherited message", () => {
    const result = generateSchemasOrThrow({
      filePath: localOverrideFixturePath,
      typeName: "Form",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const specific = expectRecord(defs["SpecificCustomer"], "$defs.SpecificCustomer");

    expectDeprecatedSchema(specific, "Use SpecificCustomerV2 instead");
    expect(specific["x-formspec-deprecation-description"]).not.toBe("Use BaseV2 instead");
  });

  it("treats presence-only local @deprecated as non-overriding", () => {
    const result = generateSchemasOrThrow({
      filePath: emptyOverrideFixturePath,
      typeName: "Form",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const presenceOnly = expectRecord(defs["PresenceOnlyCustomer"], "$defs.PresenceOnlyCustomer");

    expectDeprecatedSchema(presenceOnly, "Use BaseV2 instead");
  });

  it("treats whitespace-only local @deprecated as non-overriding", () => {
    const result = generateSchemasOrThrow({
      filePath: whitespaceOverrideFixturePath,
      typeName: "Form",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const whitespaceOnly = expectRecord(
      defs["WhitespaceOnlyCustomer"],
      "$defs.WhitespaceOnlyCustomer"
    );

    expectDeprecatedSchema(whitespaceOnly, "Use BaseV2 instead");
  });

  it("inherits @deprecated from a base class through class extends", () => {
    const result = generateSchemasOrThrow({
      filePath: classExtendsFixturePath,
      typeName: "Form",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const derived = expectRecord(defs["DerivedCustomer"], "$defs.DerivedCustomer");

    expectDeprecatedSchema(derived, "Use CustomerBaseV2 instead");

    const program = ts.createProgram({
      rootNames: [classExtendsFixturePath],
      options: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        strict: true,
        skipLibCheck: true,
      },
    });
    const ctx = createProgramContextFromProgram(program, classExtendsFixturePath);
    const derivedCustomer = findClassByName(ctx.sourceFile, "DerivedCustomer");
    if (derivedCustomer === null) throw new Error("DerivedCustomer class not found");

    const analysis = analyzeClassToIR(derivedCustomer, ctx.checker, classExtendsFixturePath);
    expectDeprecatedAnnotation(analysis.annotations, "Use CustomerBaseV2 instead");
  });

  it("inherits presence-only base @deprecated as a deprecation marker", () => {
    const result = generateSchemasOrThrow({
      filePath: basePresenceOnlyFixturePath,
      typeName: "Form",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const derived = expectRecord(defs["DerivedCustomer"], "$defs.DerivedCustomer");

    expect(derived["deprecated"]).toBe(true);
    expect(derived["x-formspec-deprecation-description"]).toBeUndefined();
  });

  it("does not inherit @deprecated through implements", () => {
    const result = generateSchemasOrThrow({
      filePath: implementsNegativeFixturePath,
      typeName: "Form",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const structural = expectRecord(defs["StructuralCustomer"], "$defs.StructuralCustomer");

    expect(structural["deprecated"]).toBeUndefined();
    expect(structural["x-formspec-deprecation-description"]).toBeUndefined();
  });

  it("does not add @deprecated when a class has no heritage and no local tag", () => {
    const result = generateSchemasOrThrow({
      filePath: noHeritageFixturePath,
      typeName: "Form",
    });

    const defs = expectRecord(result.jsonSchema.$defs ?? {}, "$defs");
    const standalone = expectRecord(defs["StandaloneCustomer"], "$defs.StandaloneCustomer");

    expect(standalone["deprecated"]).toBeUndefined();
    expect(standalone["x-formspec-deprecation-description"]).toBeUndefined();

    const program = ts.createProgram({
      rootNames: [noHeritageFixturePath],
      options: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        strict: true,
        skipLibCheck: true,
      },
    });
    const ctx = createProgramContextFromProgram(program, noHeritageFixturePath);
    const standaloneCustomer = findClassByName(ctx.sourceFile, "StandaloneCustomer");
    if (standaloneCustomer === null) throw new Error("StandaloneCustomer class not found");

    const analysis = analyzeClassToIR(standaloneCustomer, ctx.checker, noHeritageFixturePath);
    expectNoDeprecatedAnnotation(analysis.annotations);
  });
});
