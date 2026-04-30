/**
 * Heritage-walk helpers for type-level annotation inheritance.
 *
 * Walks `extends` clauses and type-alias RHS chains breadth-first to collect
 * inheritable annotation identities that the derived declaration does not
 * declare locally.
 *
 * Lives in `@formspec/analysis` so the same walk is reusable by IDE surfaces
 * (hover, diagnostics) without depending on `@formspec/build`. The walk
 * itself is decoupled from JSDoc parsing — callers supply an
 * `extractAnnotations` callback so this module does not bind to build's
 * `ParseTSDocOptions` / `ExtensionRegistry`.
 *
 * @see https://github.com/mike-north/formspec/issues/367 — initial @format inheritance
 * @see https://github.com/mike-north/formspec/issues/374 — type-alias RHS chains
 * @see https://github.com/mike-north/formspec/issues/376 — interface-extends-alias mid-chain
 * @see https://github.com/mike-north/formspec/issues/379 — relocate to @formspec/analysis
 */

import * as ts from "typescript";
import type { AnnotationNode } from "@formspec/core/internals";
import { getInheritableAnnotationKeys } from "./tag-registry.js";

export interface HeritageAnnotationOptions {
  readonly inheritableAnnotationKeys?: ReadonlySet<string>;
}

/**
 * Returns the string payload carried by an inheritable annotation, or
 * `undefined` for annotation kinds where presence alone is the signal.
 * Used to decide whether a locally-declared annotation counts as an
 * override (empty/whitespace-only payloads do not — see
 * {@link isOverridingInheritableAnnotation}).
 */
function getInheritableAnnotationStringValue(annotation: AnnotationNode): string | undefined {
  if (annotation.annotationKind === "format") return annotation.value;
  if ("value" in annotation && typeof annotation.value === "string") return annotation.value;
  return undefined;
}

/**
 * Returns `true` when a locally-declared annotation should suppress
 * heritage inheritance for its kind. An annotation whose string payload is
 * empty or whitespace-only (`/** @format * /`) is not treated as an
 * override — the base-declared value still flows through.
 */
function isOverridingInheritableAnnotation(annotation: AnnotationNode): boolean {
  const value = getInheritableAnnotationStringValue(annotation);
  if (value === undefined) return true;
  return value.trim().length > 0;
}

/**
 * Extracts annotation nodes from a declaration. Heritage-walk callers supply
 * this so the walk is independent of how JSDoc is parsed (e.g., build uses
 * its TSDoc parser plus an extension registry; another consumer may use a
 * cached or simplified extractor).
 *
 * Implementations may throw; the heritage walk does not catch — callers
 * decide whether to soft-fail (e.g., skip a hover) or propagate.
 *
 * @internal
 */
export type HeritageAnnotationExtractor = (
  decl: ts.Declaration,
  file: string
) => readonly AnnotationNode[];

/**
 * Walks base declarations reachable from a derived declaration and returns
 * any inheritable type-level annotations that the derived declaration does
 * not already specify.
 *
 * Supports three entry shapes:
 * - **Class / interface** — walks `extends` clauses (issue #367).
 * - **Interface extends a type alias** — crosses the alias node to reach
 *   annotations on a deeper object-shaped ancestor (issue #376).
 * - **Type alias whose body is a type reference** — walks the alias
 *   derivation chain (`type Foo = Bar`), following through alias-of-alias
 *   and alias-of-interface cases (issue #374).
 *
 * The walk is breadth-first across reachable bases. A seen-set on
 * declarations prevents infinite loops on pathological self-referential
 * chains. Annotations already present on the derived type (matched by
 * annotation identity) always win — only missing identities are filled in
 * from the base chain. When multiple bases provide the same identity, the
 * first found wins (earliest in the `extends` clause list, nearest ancestor
 * first).
 *
 * @param derivedDecl - The class / interface / type alias whose effective
 *   annotations are being computed.
 * @param existingAnnotations - Annotations already collected from
 *   `derivedDecl` itself. Local non-empty values suppress inheritance for
 *   their annotation identity.
 * @param checker - TypeScript checker, used to resolve symbols across
 *   alias and import boundaries.
 * @param extractAnnotations - Callback that returns annotation nodes for a
 *   given declaration. Heritage walkers do not parse JSDoc themselves.
 *
 * @internal
 */
export function collectInheritedTypeAnnotations(
  derivedDecl: ts.ClassDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
  existingAnnotations: readonly AnnotationNode[],
  checker: ts.TypeChecker,
  extractAnnotations: HeritageAnnotationExtractor,
  options: HeritageAnnotationOptions = {}
): readonly AnnotationNode[] {
  const inheritableAnnotationKeys =
    options.inheritableAnnotationKeys ?? getInheritableAnnotationKeys();
  // A local annotation only suppresses heritage inheritance when it carries a
  // meaningful payload. Empty/whitespace-only `@format` must fall through to
  // the base-declared value. See issue #367 review discussion.
  const existingKeys = new Set<string>(
    existingAnnotations
      .filter((annotation) =>
        inheritableAnnotationKeys.has(getAnnotationInheritanceKey(annotation))
      )
      .filter(isOverridingInheritableAnnotation)
      .map(getAnnotationInheritanceKey)
  );
  const needed = new Set<string>();
  for (const key of inheritableAnnotationKeys) {
    if (!existingKeys.has(key)) needed.add(key);
  }
  if (needed.size === 0) return [];

  type HeritageBearingDecl =
    | ts.ClassDeclaration
    | ts.InterfaceDeclaration
    | ts.TypeAliasDeclaration;

  const inherited: AnnotationNode[] = [];
  const seen = new Set<ts.Node>([derivedDecl]);
  const queue: HeritageBearingDecl[] = [];

  const resolveSymbolTarget = (sym: ts.Symbol): ts.Symbol => {
    if ((sym.flags & ts.SymbolFlags.Alias) === 0) return sym;
    try {
      return checker.getAliasedSymbol(sym);
    } catch {
      // TypeScript can throw when resolving certain alias chains (e.g.,
      // cyclic or partially resolved aliases). Fall back to the original
      // symbol — worst case we miss an inheritance step, not a fatal error.
      return sym;
    }
  };

  const isObjectShapedTypeAlias = (alias: ts.TypeAliasDeclaration): boolean => {
    // An interface can only legally extend an object-shaped alias (the TS
    // compiler rejects `interface X extends StringAlias`), but we guard here
    // so a misuse higher in the chain cannot pull in annotations from a
    // primitive-typed alias whose semantics do not match. The check uses
    // the alias's resolved type, not its syntactic RHS, so aliases of
    // aliases-of-interfaces are covered.
    const type = checker.getTypeFromTypeNode(alias.type);
    if ((type.flags & ts.TypeFlags.Object) !== 0) return true;
    if (type.isIntersection()) return true;
    return false;
  };

  // `fromTypeAliasRhs` differentiates two enqueue contexts:
  // - false: reached from an interface/class `extends` clause. Type-alias
  //   candidates must be object-shaped (TS compiler restriction).
  // - true:  reached from a type alias's own RHS (alias-of-alias or
  //   alias-of-interface). Primitive-typed chains are valid (issue #374:
  //   `type WorkEmail = BaseEmail = string`).
  const enqueueCandidate = (baseDecl: ts.Declaration, fromTypeAliasRhs: boolean): void => {
    if (seen.has(baseDecl)) return;
    if (ts.isClassDeclaration(baseDecl) || ts.isInterfaceDeclaration(baseDecl)) {
      seen.add(baseDecl);
      queue.push(baseDecl);
      return;
    }
    if (ts.isTypeAliasDeclaration(baseDecl)) {
      if (!fromTypeAliasRhs && !isObjectShapedTypeAlias(baseDecl)) return;
      seen.add(baseDecl);
      queue.push(baseDecl);
    }
  };

  const enqueueBasesOf = (decl: HeritageBearingDecl): void => {
    if (ts.isTypeAliasDeclaration(decl)) {
      // Type aliases have no heritage clauses. Instead, follow the alias's
      // RHS when it resolves to another named type. This unifies the
      // alias-chain walk (#374) with the interface-extends-alias mid-chain
      // case (#376) under a single traversal.
      const rhs = decl.type;
      if (!ts.isTypeReferenceNode(rhs)) return;
      const sym = checker.getSymbolAtLocation(rhs.typeName);
      if (!sym) return;
      const target = resolveSymbolTarget(sym);
      for (const baseDecl of target.declarations ?? []) {
        enqueueCandidate(baseDecl, /*fromTypeAliasRhs*/ true);
      }
      return;
    }

    const heritageClauses = decl.heritageClauses;
    if (!heritageClauses) return;
    for (const clause of heritageClauses) {
      // Only follow `extends`. `implements` does NOT propagate type-level
      // annotations: authors use `implements` to assert structural
      // conformance, not to adopt the interface's metadata. Following it
      // would silently merge annotations across unrelated nominal types.
      if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue;
      for (const typeExpr of clause.types) {
        const sym = checker.getSymbolAtLocation(typeExpr.expression);
        if (!sym) continue;
        const target = resolveSymbolTarget(sym);
        for (const baseDecl of target.declarations ?? []) {
          enqueueCandidate(baseDecl, /*fromTypeAliasRhs*/ false);
        }
      }
    }
  };

  enqueueBasesOf(derivedDecl);

  // Index-pointer traversal (vs `queue.shift()`) keeps the BFS O(n) for deep
  // heritage graphs — array shift is O(n) in V8.
  for (let queueIndex = 0; queueIndex < queue.length && needed.size > 0; queueIndex++) {
    const baseDecl = queue[queueIndex];
    if (baseDecl === undefined) continue;
    // Use the base declaration's own source file for provenance / pos-mapping.
    // The BFS may cross file boundaries, so the derived type's file is not
    // the right reference point for annotations parsed off a base declaration.
    const baseFile = baseDecl.getSourceFile().fileName;
    const baseAnnotations = extractAnnotations(baseDecl, baseFile);
    for (const annotation of baseAnnotations) {
      const annotationKey = getAnnotationInheritanceKey(annotation);
      if (!needed.has(annotationKey)) continue;
      // Skip empty-payload annotations on the base as well — they cannot
      // meaningfully fill an inherited slot.
      if (!isOverridingInheritableAnnotation(annotation)) continue;
      inherited.push(annotation);
      needed.delete(annotationKey);
    }
    // Continue up the chain if we still need kinds.
    if (needed.size > 0) {
      enqueueBasesOf(baseDecl);
    }
  }

  return inherited;
}

function getAnnotationInheritanceKey(annotation: AnnotationNode): string {
  return annotation.annotationKind === "custom"
    ? `custom:${annotation.annotationId}`
    : annotation.annotationKind;
}

/**
 * Extracts type-level annotations from a named declaration (class, interface,
 * or type alias), applying inheritance where applicable (issues #367, #374,
 * #376). Any inheritable annotation identity absent from the local declaration
 * is filled in by walking `extends` clauses and type-alias RHS chains via
 * {@link collectInheritedTypeAnnotations}.
 *
 * @internal
 */
export function extractNamedTypeAnnotations(
  namedDecl: ts.ClassDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
  checker: ts.TypeChecker,
  file: string,
  extractAnnotations: HeritageAnnotationExtractor,
  options: HeritageAnnotationOptions = {}
): readonly AnnotationNode[] {
  const local = extractAnnotations(namedDecl, file);
  const inherited = collectInheritedTypeAnnotations(
    namedDecl,
    local,
    checker,
    extractAnnotations,
    options
  );
  if (inherited.length === 0) return [...local];
  return [...local, ...inherited];
}

/**
 * Returns `true` when `namedDecl` carries an inheritable type-level
 * annotation identity, either locally with a meaningful payload or reachable
 * through the alias / heritage chain. Used by build to decide whether a
 * pass-through alias warrants its own `$defs` entry
 * (issue #374) or should collapse to the base (issue #364 sibling-keyword
 * composition).
 *
 * @internal
 */
export function hasInheritableTypeAnnotation(
  namedDecl: ts.ClassDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
  checker: ts.TypeChecker,
  file: string,
  extractAnnotations: HeritageAnnotationExtractor,
  options: HeritageAnnotationOptions = {}
): boolean {
  const inheritableAnnotationKeys =
    options.inheritableAnnotationKeys ?? getInheritableAnnotationKeys();
  const all = extractNamedTypeAnnotations(namedDecl, checker, file, extractAnnotations, options);
  for (const annotation of all) {
    if (!inheritableAnnotationKeys.has(getAnnotationInheritanceKey(annotation))) continue;
    if (!isOverridingInheritableAnnotation(annotation)) continue;
    return true;
  }
  return false;
}
