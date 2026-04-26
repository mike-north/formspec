/**
 * Unit tests for the heritage-walking annotation collector.
 *
 * These tests pin the contract of the BFS itself, with the JSDoc-extraction
 * dependency injected as a stub. The end-to-end behavior (real TSDoc parser,
 * extension registry, full IR pipeline) is covered by the integration tests
 * in `@formspec/build/tests/format-inheritance-derived-types.test.ts`.
 *
 * @see https://github.com/mike-north/formspec/issues/367 — initial @format inheritance
 * @see https://github.com/mike-north/formspec/issues/374 — type-alias RHS chains
 * @see https://github.com/mike-north/formspec/issues/376 — interface-extends-alias mid-chain
 * @see https://github.com/mike-north/formspec/issues/379 — relocate to @formspec/analysis
 */

import { describe, expect, it } from "vitest";
import * as ts from "typescript";
import type { AnnotationNode, FormatAnnotationNode } from "@formspec/core/internals";
import {
  collectInheritedTypeAnnotations,
  extractNamedTypeAnnotations,
  type HeritageAnnotationExtractor,
} from "../src/internal.js";
import { createProgram } from "./helpers.js";

function findInterface(sourceFile: ts.SourceFile, name: string): ts.InterfaceDeclaration {
  const decl = sourceFile.statements.find(
    (s): s is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(s) && s.name.text === name
  );
  if (!decl) throw new Error(`Interface "${name}" not found`);
  return decl;
}

function findClass(sourceFile: ts.SourceFile, name: string): ts.ClassDeclaration {
  const decl = sourceFile.statements.find(
    (s): s is ts.ClassDeclaration => ts.isClassDeclaration(s) && s.name?.text === name
  );
  if (!decl) throw new Error(`Class "${name}" not found`);
  return decl;
}

function findTypeAlias(sourceFile: ts.SourceFile, name: string): ts.TypeAliasDeclaration {
  const decl = sourceFile.statements.find(
    (s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === name
  );
  if (!decl) throw new Error(`Type alias "${name}" not found`);
  return decl;
}

function makeFormatAnnotation(value: string, file = "/virtual/formspec.ts"): FormatAnnotationNode {
  return {
    kind: "annotation",
    annotationKind: "format",
    value,
    provenance: { surface: "tsdoc", file, line: 1, column: 0 },
  };
}

/**
 * Stub extractor that returns a `@format` annotation whenever the declaration's
 * leading JSDoc text contains a `@format <value>` line. Keeps these tests
 * decoupled from the build TSDoc parser while exercising the BFS faithfully.
 *
 * NOTE: `decl.getFullText()` includes leading trivia, so any `@format ...`
 * substring in surrounding comments would be attributed to this declaration.
 * Test fixtures keep `@format` strictly inside JSDoc blocks. End-to-end
 * behavior with the real TSDoc parser is covered by
 * `@formspec/build/tests/format-inheritance-derived-types.test.ts`.
 */
const FORMAT_TAG_PATTERN = /@format\s+([^\s*]+)/;

function makeStubExtractor(): HeritageAnnotationExtractor {
  return (decl, file) => {
    const text = decl.getFullText();
    const match = FORMAT_TAG_PATTERN.exec(text);
    if (match?.[1] === undefined) return [];
    return [makeFormatAnnotation(match[1], file)];
  };
}

describe("collectInheritedTypeAnnotations", () => {
  it("returns the base @format when the derived interface omits one", () => {
    const { sourceFile, checker } = createProgram(`
      /** @format monetary-amount */
      interface BaseMonetary { amount: number; }
      export interface DerivedMonetary extends BaseMonetary { note?: string; }
    `);
    const derived = findInterface(sourceFile, "DerivedMonetary");

    const inherited = collectInheritedTypeAnnotations(derived, [], checker, makeStubExtractor());

    expect(inherited).toHaveLength(1);
    expect(inherited[0]?.annotationKind).toBe("format");
    expect((inherited[0] as FormatAnnotationNode).value).toBe("monetary-amount");
  });

  it("returns nothing when the derived declaration already has the kind", () => {
    const { sourceFile, checker } = createProgram(`
      /** @format monetary-amount */
      interface BaseMonetary { amount: number; }
      /** @format gross-amount */
      export interface DerivedMonetary extends BaseMonetary { amount: number; }
    `);
    const derived = findInterface(sourceFile, "DerivedMonetary");
    const localFormat = makeFormatAnnotation("gross-amount");

    const inherited = collectInheritedTypeAnnotations(
      derived,
      [localFormat],
      checker,
      makeStubExtractor()
    );

    expect(inherited).toEqual([]);
  });

  it("treats empty-payload local @format as a non-override and falls through to the base", () => {
    const { sourceFile, checker } = createProgram(`
      /** @format monetary-amount */
      interface BaseMonetary { amount: number; }
      /** @format    */
      export interface DerivedMonetary extends BaseMonetary { amount: number; }
    `);
    const derived = findInterface(sourceFile, "DerivedMonetary");
    const emptyLocal: FormatAnnotationNode = makeFormatAnnotation("   ");

    const inherited = collectInheritedTypeAnnotations(
      derived,
      [emptyLocal],
      checker,
      makeStubExtractor()
    );

    expect(inherited).toHaveLength(1);
    expect((inherited[0] as FormatAnnotationNode).value).toBe("monetary-amount");
  });

  it("walks multi-level interface extends chains (BFS, nearest-ancestor wins)", () => {
    const { sourceFile, checker } = createProgram(`
      /** @format root-format */
      interface Root { x: number; }
      /** @format mid-format */
      interface Mid extends Root { x: number; }
      export interface Leaf extends Mid { x: number; }
    `);
    const leaf = findInterface(sourceFile, "Leaf");

    const inherited = collectInheritedTypeAnnotations(leaf, [], checker, makeStubExtractor());

    expect(inherited).toHaveLength(1);
    expect((inherited[0] as FormatAnnotationNode).value).toBe("mid-format");
  });

  it("crosses an interface-extends-alias boundary (issue #376)", () => {
    const { sourceFile, checker } = createProgram(`
      /** @format monetary-amount */
      interface BaseMonetary { amount: number; }
      type AliasedBase = BaseMonetary;
      export interface DerivedFromAlias extends AliasedBase { amount: number; }
    `);
    const derived = findInterface(sourceFile, "DerivedFromAlias");

    const inherited = collectInheritedTypeAnnotations(derived, [], checker, makeStubExtractor());

    expect(inherited).toHaveLength(1);
    expect((inherited[0] as FormatAnnotationNode).value).toBe("monetary-amount");
  });

  it("walks a type-alias RHS chain through to a primitive (issue #374)", () => {
    const { sourceFile, checker } = createProgram(`
      /** @format work-email */
      type BaseEmail = string;
      export type WorkEmail = BaseEmail;
    `);
    const derived = findTypeAlias(sourceFile, "WorkEmail");

    const inherited = collectInheritedTypeAnnotations(derived, [], checker, makeStubExtractor());

    expect(inherited).toHaveLength(1);
    expect((inherited[0] as FormatAnnotationNode).value).toBe("work-email");
  });

  it("does not follow `implements` clauses", () => {
    const { sourceFile, checker } = createProgram(`
      /** @format monetary-amount */
      interface IMonetary { amount: number; }
      export class Plain implements IMonetary { amount = 0; }
    `);
    const derived = findClass(sourceFile, "Plain");

    const inherited = collectInheritedTypeAnnotations(derived, [], checker, makeStubExtractor());

    expect(inherited).toEqual([]);
  });

  it("returns empty when the derived declaration has no heritage", () => {
    const { sourceFile, checker } = createProgram(`
      export interface Standalone { x: number; }
    `);
    const standalone = findInterface(sourceFile, "Standalone");

    const inherited = collectInheritedTypeAnnotations(
      standalone,
      [],
      checker,
      makeStubExtractor()
    );

    expect(inherited).toEqual([]);
  });

  it("does not invoke the extractor when no inheritable kinds are needed", () => {
    const { sourceFile, checker } = createProgram(`
      /** @format root-format */
      interface Root { x: number; }
      export interface Leaf extends Root { x: number; }
    `);
    const leaf = findInterface(sourceFile, "Leaf");
    const localFormat = makeFormatAnnotation("local");
    let calls = 0;
    const counting: HeritageAnnotationExtractor = (decl, file) => {
      calls += 1;
      return makeStubExtractor()(decl, file);
    };

    const inherited = collectInheritedTypeAnnotations(leaf, [localFormat], checker, counting);

    expect(inherited).toEqual([]);
    expect(calls).toBe(0);
  });

  it("symmetric diamond: earliest base in extends list wins", () => {
    // The BFS enqueues base-clauses left-to-right. Both `Left` and `Right`
    // carry an inheritable kind; nearest-ancestor + earliest-clause wins.
    const { sourceFile, checker } = createProgram(`
      /** @format left-format */
      interface Left { x: number; }
      /** @format right-format */
      interface Right { x: number; }
      export interface Leaf extends Left, Right { x: number; }
    `);
    const leaf = findInterface(sourceFile, "Leaf");

    const inherited = collectInheritedTypeAnnotations(leaf, [], checker, makeStubExtractor());

    expect(inherited).toHaveLength(1);
    expect((inherited[0] as FormatAnnotationNode).value).toBe("left-format");
  });

  it("asymmetric diamond: nearer ancestor beats farther ancestor under same root", () => {
    // BFS depth: Mid is at depth 1, Root is at depth 2 from `Leaf`. Mid wins.
    const { sourceFile, checker } = createProgram(`
      /** @format root-format */
      interface Root { x: number; }
      /** @format mid-format */
      interface Mid extends Root { x: number; }
      // Leaf reaches Root via two paths: directly (depth 1), and via Mid (depth 2).
      // The direct path is enqueued first, so Root would be found at depth 1 too —
      // but Mid is also at depth 1 and listed first in the extends clause.
      export interface Leaf extends Mid, Root { x: number; }
    `);
    const leaf = findInterface(sourceFile, "Leaf");

    const inherited = collectInheritedTypeAnnotations(leaf, [], checker, makeStubExtractor());

    expect(inherited).toHaveLength(1);
    expect((inherited[0] as FormatAnnotationNode).value).toBe("mid-format");
  });

  it("falls through to a deeper base when the nearer base has no inheritable annotation", () => {
    // Mid intentionally has no @format; the BFS keeps walking past it to Root.
    const { sourceFile, checker } = createProgram(`
      /** @format root-format */
      interface Root { x: number; }
      interface Mid extends Root { x: number; }
      export interface Leaf extends Mid { x: number; }
    `);
    const leaf = findInterface(sourceFile, "Leaf");

    const inherited = collectInheritedTypeAnnotations(leaf, [], checker, makeStubExtractor());

    expect(inherited).toHaveLength(1);
    expect((inherited[0] as FormatAnnotationNode).value).toBe("root-format");
  });

  it("survives self-referential heritage without infinite-looping", () => {
    const { sourceFile, checker } = createProgram(`
      // Pathological but representable in source — TS will type-check this as
      // a circular reference, but the heritage walker must terminate.
      interface A extends B { x: number; }
      interface B extends A { y: number; }
      export interface C extends A { z: number; }
    `);
    const c = findInterface(sourceFile, "C");

    const inherited = collectInheritedTypeAnnotations(c, [], checker, makeStubExtractor());

    // No annotation reachable; the meaningful assertion is that we returned
    // at all (no infinite loop).
    expect(inherited).toEqual([]);
  });
});

describe("extractNamedTypeAnnotations", () => {
  it("composes local annotations with inherited ones", () => {
    const { sourceFile, checker } = createProgram(`
      /** @format base-format */
      interface Base { x: number; }
      export interface Leaf extends Base { x: number; }
    `);
    const leaf = findInterface(sourceFile, "Leaf");

    const result = extractNamedTypeAnnotations(
      leaf,
      checker,
      "/virtual/formspec.ts",
      makeStubExtractor()
    );

    // No local @format on Leaf, but inherited from Base.
    expect(result).toHaveLength(1);
    expect((result[0] as FormatAnnotationNode).value).toBe("base-format");
  });

  it("returns local annotations only when the local declaration overrides", () => {
    const { sourceFile, checker } = createProgram(`
      /** @format base-format */
      interface Base { x: number; }
      /** @format leaf-format */
      export interface Leaf extends Base { x: number; }
    `);
    const leaf = findInterface(sourceFile, "Leaf");

    const result = extractNamedTypeAnnotations(
      leaf,
      checker,
      "/virtual/formspec.ts",
      makeStubExtractor()
    );

    const formatAnnotations = result.filter(
      (a: AnnotationNode): a is FormatAnnotationNode => a.annotationKind === "format"
    );
    expect(formatAnnotations).toHaveLength(1);
    expect(formatAnnotations[0]?.value).toBe("leaf-format");
  });
});
