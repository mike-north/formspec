/**
 * Snapshot-path coverage for the `isIntegerBrandedType` bypass.
 *
 * Mirrors the 7 build-path scenarios from
 * `packages/build/tests/integer-type.test.ts` (lines 439–637,
 * multi-branded Integer section) through `buildFormSpecAnalysisFileSnapshot`.
 *
 * The build path asserts on generated JSON Schema output; the snapshot path
 * asserts on diagnostic presence/absence (TYPE_MISMATCH).
 *
 * Phase 4A (closes #325) added the `isIntegerBrandedType` bypass to the
 * snapshot consumer. All 6 numeric-constraint scenarios that were previously
 * KNOWN DIVERGENCE now converge: the snapshot path no longer emits
 * TYPE_MISMATCH for @minimum/@maximum on integer-branded types.
 *
 * Scenario 5 (@pattern) correctly produces TYPE_MISMATCH on both paths.
 *
 * Scenarios 6 and 7 (cross-file integer + sibling string field) are
 * partially resolved: the integer field no longer produces TYPE_MISMATCH, but
 * the sibling string fields may still be poisoned by the synthetic batch
 * checker failing to resolve the imported integer type in its supporting
 * declarations. This sibling-poisoning issue is tracked separately and is
 * deferred to Phase 5 (synthetic checker retirement).
 *
 * @see packages/build/tests/integer-type.test.ts — build-path reference
 * @see packages/analysis/src/file-snapshots.ts — buildFormSpecAnalysisFileSnapshot
 * @see packages/analysis/src/integer-brand.ts — isIntegerBrandedType
 * @see docs/refactors/synthetic-checker-retirement.md §9.1 #3
 */

import * as path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { buildFormSpecAnalysisFileSnapshot } from "../src/internal.js";
import { createProgram } from "./helpers.js";

// ---------------------------------------------------------------------------
// Virtual multi-file program helper
// ---------------------------------------------------------------------------

/**
 * Creates a TypeScript program backed by a map of virtual in-memory files.
 * Returns the checker and the source file for `primaryFileName`.
 *
 * This is the multi-file analogue of `createProgram` in helpers.ts — needed
 * here because the cross-file integer-import scenarios require a separate
 * "types.ts" module that exports `MultiBrandedInteger`.
 *
 * Uses `module: NodeNext` with a custom `resolveModuleNames` override that
 * maps `.js` import specifiers to `.ts` file keys in the `files` map.
 * This is required so that `checker.getTypeAtLocation(propertySignature)`
 * returns the fully-resolved intersection type (TypeFlags.Intersection)
 * rather than a placeholder Any type — the same behaviour TypeScript
 * produces for real on-disk files.
 *
 * Fixture sources must import with `.js` extensions
 * (e.g. `from "./types.js"`) which NodeNext module resolution maps to
 * the `.ts` source file in the virtual file map.
 */
function createMultiFileProgram(
  files: Record<string, string>,
  primaryFileName: string
): { checker: ts.TypeChecker; sourceFile: ts.SourceFile } {
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
  };

  const host = ts.createCompilerHost(compilerOptions, true);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);

  const resolveVirtualPath = (requestedFileName: string): string => {
    // Map .js imports to .ts for virtual files (NodeNext: "import './foo.js'" → 'foo.ts')
    const tsEquivalent = requestedFileName.replace(/\.js$/, ".ts");
    if (tsEquivalent in files) return tsEquivalent;
    return requestedFileName;
  };

  host.getSourceFile = (requestedFileName, languageVersion) => {
    const resolved = resolveVirtualPath(requestedFileName);
    const content = files[resolved];
    if (content !== undefined) {
      return ts.createSourceFile(resolved, content, languageVersion, true, ts.ScriptKind.TS);
    }
    return originalGetSourceFile(requestedFileName, languageVersion);
  };
  host.readFile = (requestedFileName) => {
    const resolved = resolveVirtualPath(requestedFileName);
    return files[resolved] ?? originalReadFile(requestedFileName);
  };
  host.fileExists = (requestedFileName) => {
    const resolved = resolveVirtualPath(requestedFileName);
    return resolved in files || originalFileExists(requestedFileName);
  };
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  host.writeFile = () => {};

  // Override module resolution so that `.js` imports in virtual files
  // are mapped to their `.ts` counterparts in the `files` map.
  // Uses `resolveModuleNameLiterals` (preferred over deprecated `resolveModuleNames`)
  // so NodeNext resolution mode is correctly handled.
  host.resolveModuleNameLiterals = (
    moduleLiterals: readonly ts.StringLiteralLike[],
    containingFile: string,
    _redirectedReference: ts.ResolvedProjectReference | undefined,
    options: ts.CompilerOptions
  ): readonly ts.ResolvedModuleWithFailedLookupLocations[] => {
    return moduleLiterals.map((literal) => {
      const moduleName = literal.text;
      const resolvedAbsolute = path.resolve(path.dirname(containingFile), moduleName);
      const tsEquivalent = resolvedAbsolute.replace(/\.js$/, ".ts");
      if (tsEquivalent in files) {
        return {
          resolvedModule: {
            resolvedFileName: tsEquivalent,
            isExternalLibraryImport: false,
            extension: ts.Extension.Ts,
          },
        };
      }
      if (resolvedAbsolute in files) {
        return {
          resolvedModule: {
            resolvedFileName: resolvedAbsolute,
            isExternalLibraryImport: false,
            extension: ts.Extension.Ts,
          },
        };
      }
      // Fall through to normal TypeScript resolution for real library imports.
      return ts.resolveModuleName(moduleName, containingFile, options, host);
    });
  };

  const rootNames = Object.keys(files);
  const program = ts.createProgram(rootNames, compilerOptions, host);
  const sourceFile = program.getSourceFile(primaryFileName);
  if (sourceFile === undefined) {
    throw new Error(`Expected virtual source file: ${primaryFileName}`);
  }

  return { checker: program.getTypeChecker(), sourceFile };
}

// ---------------------------------------------------------------------------
// Fixture sources
// ---------------------------------------------------------------------------

/**
 * The "types module" that exports MultiBrandedInteger — mirrors the
 * TYPES_SOURCE fixture in integer-type.test.ts.
 */
const TYPES_SOURCE = [
  "declare const __integerBrand: unique symbol;",
  "declare const __stripeType: unique symbol;",
  "export type MultiBrandedInteger = number & { readonly [__integerBrand]: true; readonly [__stripeType]: 'int' };",
].join("\n");

const TYPES_FILE = "/virtual/types.ts";
const PRIMARY_FILE = "/virtual/importing.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a snapshot from a single-file inline source string.
 */
function snapshotFromSource(source: string): ReturnType<typeof buildFormSpecAnalysisFileSnapshot> {
  const { checker, sourceFile } = createProgram(source, "/virtual/formspec-integer.ts");
  return buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });
}

/**
 * Build a snapshot for the importing fixture, which imports MultiBrandedInteger
 * from a sibling virtual "types.ts" file.
 */
function snapshotFromImportingSource(
  importingSource: string
): ReturnType<typeof buildFormSpecAnalysisFileSnapshot> {
  const { checker, sourceFile } = createMultiFileProgram(
    {
      [TYPES_FILE]: TYPES_SOURCE,
      [PRIMARY_FILE]: importingSource,
    },
    PRIMARY_FILE
  );
  return buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });
}

type Snapshot = ReturnType<typeof buildFormSpecAnalysisFileSnapshot>;

/**
 * Returns the list of `data.tagName` values for every TYPE_MISMATCH diagnostic
 * in the snapshot. Each entry corresponds to one diagnostic (so duplicates are
 * preserved and order reflects emission order).
 *
 * This is stricter than a plain "any TYPE_MISMATCH exists" check — callers can
 * assert both the set of affected tags and the total count.
 */
function typeMismatchTagNames(snapshot: Snapshot): string[] {
  return snapshot.diagnostics
    .filter((d) => d.code === "TYPE_MISMATCH")
    .map((d) => {
      const tagName = d.data["tagName"];
      // Per-application diagnostics carry data.tagName (string).
      if (typeof tagName === "string") return tagName;
      // Global batch diagnostics carry data.tagNames (string[]). Return each
      // member individually so callers see one entry per affected tag.
      const tagNames = d.data["tagNames"];
      if (Array.isArray(tagNames)) return tagNames.map(String).join(",");
      // Fallback for any future diagnostic shapes.
      return "<unknown>";
    });
}

/**
 * Returns every declaration-level `numeric-constraints` fact recorded in the
 * snapshot (one per field that had @minimum/@maximum/etc applied). Empty array
 * means no numeric constraints were captured — which, in these scenarios, is
 * the failure shape we want to guard against: a future regression that silently
 * drops integer-field processing would make the TYPE_MISMATCH diagnostic check
 * pass while losing the constraint entirely.
 */
function declarationNumericConstraints(
  snapshot: Snapshot
): { minimum?: number; maximum?: number }[] {
  const results: { minimum?: number; maximum?: number }[] = [];
  for (const comment of snapshot.comments) {
    for (const fact of comment.declarationSummary.facts) {
      if (fact.kind === "numeric-constraints" && fact.targetPath === null) {
        const entry: { minimum?: number; maximum?: number } = {};
        if (fact.minimum !== undefined) entry.minimum = fact.minimum;
        if (fact.maximum !== undefined) entry.maximum = fact.maximum;
        results.push(entry);
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("integer-brand bypass: snapshot path mirrors build path (regression for #325)", () => {
  // -------------------------------------------------------------------------
  // Scenario 1: locally-declared doubly-branded integer with @minimum/@maximum
  //
  // Build path: generateSchemasOrThrow({ typeName: "MultiBrandedConstrainedConfig" })
  //   succeeds and produces minimum: 2000, maximum: 2026. No TYPE_MISMATCH.
  //
  // Phase 4A: snapshot path now also produces no TYPE_MISMATCH (bypass added).
  // -------------------------------------------------------------------------
  it("scenario 1: locally-declared doubly-branded integer — no TYPE_MISMATCH (bypass applied in both paths)", () => {
    // Mirrors integer-type.test.ts "accepts @minimum and @maximum on a doubly-branded
    // integer type (locally declared)"
    const source = [
      "declare const __integerBrand: unique symbol;",
      "declare const __stripeType: unique symbol;",
      "type MultiBrandedInteger = number & { readonly [__integerBrand]: true; readonly [__stripeType]: 'int' };",
      "",
      "interface MultiBrandedConstrainedConfig {",
      "  /** @minimum 2000 @maximum 2026 */",
      "  year: MultiBrandedInteger;",
      "}",
    ].join("\n");

    const snapshot = snapshotFromSource(source);

    // Phase 4A: integer-brand bypass now applied in snapshot path.
    // No TYPE_MISMATCH should be emitted for @minimum/@maximum on integer-branded types.
    const tagNames = typeMismatchTagNames(snapshot);
    expect(tagNames.filter((n) => n === "minimum" || n === "maximum")).toHaveLength(0);

    // Positive check: the bypass must not drop the constraint — the snapshot
    // must record the 2000/2026 bounds derived from @minimum/@maximum.
    expect(declarationNumericConstraints(snapshot)).toContainEqual({
      minimum: 2000,
      maximum: 2026,
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: imported doubly-branded integer with @minimum/@maximum
  //
  // Build path: generateSchemasOrThrow({ typeName: "CrossFileConstrainedConfig" })
  //   succeeds (isIntegerBrandedType bypass prevents TYPE_MISMATCH).
  //
  // Phase 4A: snapshot path now also produces no TYPE_MISMATCH.
  // -------------------------------------------------------------------------
  it("scenario 2: imported doubly-branded integer — no TYPE_MISMATCH (bypass applied in both paths)", () => {
    // Mirrors integer-type.test.ts "accepts @minimum and @maximum on a doubly-branded
    // integer type imported from another module"
    const importingSource = [
      'import type { MultiBrandedInteger } from "./types.js";',
      "",
      "interface CrossFileConstrainedConfig {",
      "  /** @minimum 2000 @maximum 2026 */",
      "  year: MultiBrandedInteger;",
      "}",
    ].join("\n");

    const snapshot = snapshotFromImportingSource(importingSource);

    // Phase 4A: no TYPE_MISMATCH for @minimum/@maximum on imported integer brands.
    const tagNames = typeMismatchTagNames(snapshot);
    expect(tagNames.filter((n) => n === "minimum" || n === "maximum")).toHaveLength(0);

    // Positive check: bounds are recorded in the declaration summary.
    expect(declarationNumericConstraints(snapshot)).toContainEqual({
      minimum: 2000,
      maximum: 2026,
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3: nullable imported integer `MultiBrandedInteger | null` with @minimum
  //
  // Build path: generateSchemasOrThrow({ typeName: "CrossFileNullableConfig" })
  //   succeeds.
  //
  // Phase 4A: snapshot path now also produces no TYPE_MISMATCH.
  // -------------------------------------------------------------------------
  it("scenario 3: nullable imported integer (MultiBrandedInteger | null) — no TYPE_MISMATCH (bypass strips nullish union)", () => {
    // Mirrors integer-type.test.ts "accepts @minimum on a nullable imported integer type"
    const importingSource = [
      'import type { MultiBrandedInteger } from "./types.js";',
      "",
      "interface CrossFileNullableConfig {",
      "  /** @minimum 0 */",
      "  score: MultiBrandedInteger | null;",
      "}",
    ].join("\n");

    const snapshot = snapshotFromImportingSource(importingSource);

    // Phase 4A: stripNullishUnion removes | null before isIntegerBrandedType
    // check, so nullable integer fields are correctly bypassed.
    const tagNames = typeMismatchTagNames(snapshot);
    const minimumMismatches = tagNames.filter((n) => n === "minimum");
    expect(minimumMismatches).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Scenario 4: optional imported integer field with @minimum
  //
  // Build path: generateSchemasOrThrow({ typeName: "CrossFileOptionalConfig" })
  //   succeeds.
  //
  // Phase 4A: snapshot path now also produces no TYPE_MISMATCH.
  // -------------------------------------------------------------------------
  it("scenario 4: optional imported integer field — no TYPE_MISMATCH (bypass strips nullish union)", () => {
    // Mirrors integer-type.test.ts "accepts @minimum on an optional imported integer type"
    const importingSource = [
      'import type { MultiBrandedInteger } from "./types.js";',
      "",
      "interface CrossFileOptionalConfig {",
      "  /** @minimum 0 */",
      "  score?: MultiBrandedInteger;",
      "}",
    ].join("\n");

    const snapshot = snapshotFromImportingSource(importingSource);

    // Phase 4A: optional fields (T | undefined after TS expands ?) are handled
    // by stripNullishUnion before the brand check.
    const tagNames = typeMismatchTagNames(snapshot);
    const minimumMismatches = tagNames.filter((n) => n === "minimum");
    expect(minimumMismatches).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Scenario 5: @pattern on imported integer type — must emit TYPE_MISMATCH
  //
  // Both paths agree: @pattern is not valid on numeric/integer types.
  // Build path: generateSchemasOrThrow throws with /TYPE_MISMATCH/.
  // Snapshot path: also emits TYPE_MISMATCH.
  // No divergence — unchanged by Phase 4A.
  // -------------------------------------------------------------------------
  it("scenario 5: @pattern on imported integer type — both paths emit TYPE_MISMATCH (numeric bypass is numeric-only)", () => {
    // Mirrors integer-type.test.ts "rejects @pattern on an imported integer type"
    const importingSource = [
      'import type { MultiBrandedInteger } from "./types.js";',
      "",
      "interface CrossFilePatternConfig {",
      "  /** @pattern ^[0-9]+$ */",
      "  code: MultiBrandedInteger;",
      "}",
    ].join("\n");

    const snapshot = snapshotFromImportingSource(importingSource);

    // Both paths agree: TYPE_MISMATCH is correct — @pattern is not valid on
    // integer/number-like types regardless of the integer brand bypass.
    // Pinning: all mismatches must be tied to @pattern specifically.
    const tagNames = typeMismatchTagNames(snapshot);
    expect(tagNames.length).toBeGreaterThan(0);
    for (const name of tagNames) {
      expect(name).toBe("pattern");
    }
  });

  // -------------------------------------------------------------------------
  // Scenario 6: cross-file integer + sibling plain-string field (interface)
  //
  // Build path: generateSchemasOrThrow({ typeName: "CrossFileMixedConfig" })
  //   succeeds; both @minimum on integer AND @minLength/@maxLength on string work.
  //
  // Phase 4A (partial): the integer field's @minimum no longer emits
  // TYPE_MISMATCH. However, the sibling string fields' @minLength/@maxLength
  // may still be poisoned by the synthetic batch checker failing to resolve the
  // imported integer type in its supporting declarations. Full sibling-field
  // parity is deferred to Phase 5 (synthetic checker retirement).
  // -------------------------------------------------------------------------
  it("scenario 6: imported integer + sibling string field in interface — @minimum bypassed; sibling constraints may still be affected", () => {
    // Mirrors integer-type.test.ts "does not poison sibling string fields with
    // imported integer type constraints"
    const importingSource = [
      'import type { MultiBrandedInteger } from "./types.js";',
      "",
      "interface CrossFileMixedConfig {",
      "  /** @minimum 2000 */",
      "  year: MultiBrandedInteger;",
      "",
      "  /**",
      "   * @minLength 17",
      "   * @maxLength 17",
      "   */",
      "  vin: string;",
      "}",
    ].join("\n");

    const snapshot = snapshotFromImportingSource(importingSource);

    // Phase 4A: integer field's @minimum is now bypassed — no TYPE_MISMATCH
    // for @minimum on the integer field.
    const tagNames = typeMismatchTagNames(snapshot);
    expect(tagNames).not.toContain("minimum");

    // Positive check: the integer field's @minimum 2000 must be recorded in
    // the declaration summary. Guards against a future regression where the
    // pipeline silently drops integer-field processing — the diagnostic check
    // alone would not catch that.
    expect(declarationNumericConstraints(snapshot)).toContainEqual({ minimum: 2000 });

    // The sibling string fields may still be affected by the synthetic batch
    // checker (supporting declarations include the unresolvable imported type).
    // Any remaining mismatches must only be from the string constraint tags —
    // this pins the boundary of the remaining divergence.
    for (const name of tagNames) {
      expect(["minLength", "maxLength"]).toContain(name);
    }
  });

  // -------------------------------------------------------------------------
  // Scenario 7: cross-file integer + sibling plain-string field (type alias)
  //
  // Build path: generateSchemasOrThrow({ typeName: "CrossFileMixedTypeAlias" })
  //   succeeds; both fields work.
  //
  // Phase 4A (partial): same as scenario 6 — integer field bypassed, sibling
  // string fields may still be affected by synthetic batch checker.
  // -------------------------------------------------------------------------
  it("scenario 7: imported integer + sibling string field in type alias — @minimum bypassed; sibling constraints may still be affected", () => {
    // Mirrors integer-type.test.ts "does not poison sibling string fields in
    // type alias declarations"
    const importingSource = [
      'import type { MultiBrandedInteger } from "./types.js";',
      "",
      "type CrossFileMixedTypeAlias = {",
      "  /** @minimum 2000 */",
      "  year: MultiBrandedInteger;",
      "",
      "  /**",
      "   * @minLength 17",
      "   * @maxLength 17",
      "   */",
      "  vin: string;",
      "};",
    ].join("\n");

    const snapshot = snapshotFromImportingSource(importingSource);

    // Phase 4A: integer field's @minimum is bypassed — no TYPE_MISMATCH for
    // @minimum.
    const tagNames = typeMismatchTagNames(snapshot);
    expect(tagNames).not.toContain("minimum");

    // Positive check: @minimum 2000 was recorded on the integer field.
    expect(declarationNumericConstraints(snapshot)).toContainEqual({ minimum: 2000 });

    // Sibling string fields may still be affected. Remaining mismatches must
    // only be from string constraint tags.
    for (const name of tagNames) {
      expect(["minLength", "maxLength"]).toContain(name);
    }
  });
});
