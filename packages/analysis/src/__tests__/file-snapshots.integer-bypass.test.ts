/**
 * Snapshot-path coverage for the `isIntegerBrandedType` bypass.
 *
 * Mirrors the 7 build-path scenarios from
 * `packages/build/src/__tests__/integer-type.test.ts` (lines 439–637,
 * multi-branded Integer section) through `buildFormSpecAnalysisFileSnapshot`.
 *
 * The build path asserts on generated JSON Schema output; the snapshot path
 * asserts on diagnostic presence/absence (TYPE_MISMATCH). Where behavior
 * diverges between the two paths a `// KNOWN DIVERGENCE` comment documents
 * current behavior so regressions can be detected later.
 *
 * Summary of divergences discovered (all 6 numeric-constraint scenarios):
 *   The `isIntegerBrandedType` bypass lives exclusively in the build path's
 *   synthetic-checker logic (packages/build/src/analyzer/class-analyzer.ts).
 *   The snapshot path (packages/analysis/src/file-snapshots.ts) runs the real
 *   TypeScript checker against the full source and emits TYPE_MISMATCH for
 *   @minimum/@maximum on integer-branded types because the snapshot's synthetic
 *   batch checker (compiler-signatures.ts) does not apply the same bypass.
 *   Scenario 5 (@pattern) correctly produces TYPE_MISMATCH on both paths.
 *
 * @see packages/build/src/__tests__/integer-type.test.ts — build-path reference
 * @see packages/analysis/src/file-snapshots.ts — buildFormSpecAnalysisFileSnapshot
 * @see packages/build/src/analyzer/class-analyzer.ts — isIntegerBrandedType
 * @see docs/refactors/synthetic-checker-retirement.md §9.1 #3
 */

import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { buildFormSpecAnalysisFileSnapshot } from "../internal.js";

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
 */
function createMultiFileProgram(
  files: Record<string, string>,
  primaryFileName: string
): { checker: ts.TypeChecker; sourceFile: ts.SourceFile } {
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    strict: true,
  };

  const host = ts.createCompilerHost(compilerOptions, true);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);

  host.getSourceFile = (requestedFileName, languageVersion) => {
    const content = files[requestedFileName];
    if (content !== undefined) {
      return ts.createSourceFile(requestedFileName, content, languageVersion, true, ts.ScriptKind.TS);
    }
    return originalGetSourceFile(requestedFileName, languageVersion);
  };
  host.readFile = (requestedFileName) => {
    const content = files[requestedFileName];
    return content ?? originalReadFile(requestedFileName);
  };
  host.fileExists = (requestedFileName) =>
    requestedFileName in files || originalFileExists(requestedFileName);
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  host.writeFile = () => {};

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
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    strict: true,
  };
  const host = ts.createCompilerHost(compilerOptions, true);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);
  const fileName = "/virtual/formspec-integer.ts";

  host.getSourceFile = (requestedFileName, languageVersion) => {
    if (requestedFileName === fileName) {
      return ts.createSourceFile(fileName, source, languageVersion, true, ts.ScriptKind.TS);
    }
    return originalGetSourceFile(requestedFileName, languageVersion);
  };
  host.readFile = (requestedFileName) =>
    requestedFileName === fileName ? source : originalReadFile(requestedFileName);
  host.fileExists = (requestedFileName) =>
    requestedFileName === fileName || originalFileExists(requestedFileName);
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  host.writeFile = () => {};

  const program = ts.createProgram([fileName], compilerOptions, host);
  const sourceFile = program.getSourceFile(fileName);
  if (sourceFile === undefined) throw new Error("Expected virtual source file");

  return buildFormSpecAnalysisFileSnapshot(sourceFile, {
    checker: program.getTypeChecker(),
  });
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

function hasTypeMismatch(snapshot: ReturnType<typeof buildFormSpecAnalysisFileSnapshot>): boolean {
  return snapshot.diagnostics.some((d) => d.code === "TYPE_MISMATCH");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("integer-brand bypass: snapshot path mirrors build path", () => {
  // -------------------------------------------------------------------------
  // Scenario 1: locally-declared doubly-branded integer with @minimum/@maximum
  //
  // Build path: generateSchemasOrThrow({ typeName: "MultiBrandedConstrainedConfig" })
  //   succeeds and produces minimum: 2000, maximum: 2026. No TYPE_MISMATCH.
  //
  // KNOWN DIVERGENCE: The snapshot path produces TYPE_MISMATCH for @minimum/
  // @maximum on doubly-branded integer types. The `isIntegerBrandedType` bypass
  // (class-analyzer.ts) only runs inside the build path's synthetic checker; the
  // snapshot path's synthetic batch checker (compiler-signatures.ts) does not
  // apply the same broadening. Current snapshot behavior: TYPE_MISMATCH emitted.
  // -------------------------------------------------------------------------
  it("scenario 1: locally-declared doubly-branded integer — KNOWN DIVERGENCE: snapshot emits TYPE_MISMATCH, build path does not", () => {
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

    // KNOWN DIVERGENCE: build path → no TYPE_MISMATCH (isIntegerBrandedType bypass
    // applied). Snapshot path → TYPE_MISMATCH emitted (bypass not applied here).
    // Pinning current snapshot behavior so regressions in either direction are caught.
    expect(hasTypeMismatch(snapshot)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: imported doubly-branded integer with @minimum/@maximum
  //
  // Build path: generateSchemasOrThrow({ typeName: "CrossFileConstrainedConfig" })
  //   succeeds (isIntegerBrandedType bypass prevents TYPE_MISMATCH).
  //
  // KNOWN DIVERGENCE: snapshot path emits TYPE_MISMATCH on imported integer brands.
  // -------------------------------------------------------------------------
  it("scenario 2: imported doubly-branded integer — KNOWN DIVERGENCE: snapshot emits TYPE_MISMATCH, build path does not", () => {
    // Mirrors integer-type.test.ts "accepts @minimum and @maximum on a doubly-branded
    // integer type imported from another module"
    const importingSource = [
      `import type { MultiBrandedInteger } from "${TYPES_FILE}";`,
      "",
      "interface CrossFileConstrainedConfig {",
      "  /** @minimum 2000 @maximum 2026 */",
      "  year: MultiBrandedInteger;",
      "}",
    ].join("\n");

    const snapshot = snapshotFromImportingSource(importingSource);

    // KNOWN DIVERGENCE: build path → no TYPE_MISMATCH (isIntegerBrandedType bypass
    // applied). Snapshot path → TYPE_MISMATCH emitted (bypass not applied here).
    // Pinning current snapshot behavior so regressions in either direction are caught.
    expect(hasTypeMismatch(snapshot)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Scenario 3: nullable imported integer `MultiBrandedInteger | null` with @minimum
  //
  // Build path: generateSchemasOrThrow({ typeName: "CrossFileNullableConfig" })
  //   succeeds.
  //
  // KNOWN DIVERGENCE: snapshot path emits TYPE_MISMATCH on nullable integer brands.
  // -------------------------------------------------------------------------
  it("scenario 3: nullable imported integer (MultiBrandedInteger | null) — KNOWN DIVERGENCE: snapshot emits TYPE_MISMATCH, build path does not", () => {
    // Mirrors integer-type.test.ts "accepts @minimum on a nullable imported integer type"
    const importingSource = [
      `import type { MultiBrandedInteger } from "${TYPES_FILE}";`,
      "",
      "interface CrossFileNullableConfig {",
      "  /** @minimum 0 */",
      "  score: MultiBrandedInteger | null;",
      "}",
    ].join("\n");

    const snapshot = snapshotFromImportingSource(importingSource);

    // KNOWN DIVERGENCE: build path → no TYPE_MISMATCH. Snapshot path → TYPE_MISMATCH emitted.
    // Pinning current snapshot behavior.
    expect(hasTypeMismatch(snapshot)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Scenario 4: optional imported integer field with @minimum
  //
  // Build path: generateSchemasOrThrow({ typeName: "CrossFileOptionalConfig" })
  //   succeeds.
  //
  // KNOWN DIVERGENCE: snapshot path emits TYPE_MISMATCH on optional integer brands.
  // -------------------------------------------------------------------------
  it("scenario 4: optional imported integer field — KNOWN DIVERGENCE: snapshot emits TYPE_MISMATCH, build path does not", () => {
    // Mirrors integer-type.test.ts "accepts @minimum on an optional imported integer type"
    const importingSource = [
      `import type { MultiBrandedInteger } from "${TYPES_FILE}";`,
      "",
      "interface CrossFileOptionalConfig {",
      "  /** @minimum 0 */",
      "  score?: MultiBrandedInteger;",
      "}",
    ].join("\n");

    const snapshot = snapshotFromImportingSource(importingSource);

    // KNOWN DIVERGENCE: build path → no TYPE_MISMATCH. Snapshot path → TYPE_MISMATCH emitted.
    // Pinning current snapshot behavior.
    expect(hasTypeMismatch(snapshot)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Scenario 5: @pattern on imported integer type — must emit TYPE_MISMATCH
  //
  // Both paths agree: @pattern is not valid on numeric/integer types.
  // Build path: generateSchemasOrThrow throws with /TYPE_MISMATCH/.
  // Snapshot path: also emits TYPE_MISMATCH.
  // No divergence.
  // -------------------------------------------------------------------------
  it("scenario 5: @pattern on imported integer type — both paths emit TYPE_MISMATCH (numeric bypass is numeric-only)", () => {
    // Mirrors integer-type.test.ts "rejects @pattern on an imported integer type"
    const importingSource = [
      `import type { MultiBrandedInteger } from "${TYPES_FILE}";`,
      "",
      "interface CrossFilePatternConfig {",
      "  /** @pattern ^[0-9]+$ */",
      "  code: MultiBrandedInteger;",
      "}",
    ].join("\n");

    const snapshot = snapshotFromImportingSource(importingSource);

    // Both paths agree: TYPE_MISMATCH is correct here — @pattern is not valid on
    // integer/number-like types regardless of the integer brand bypass.
    expect(hasTypeMismatch(snapshot)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Scenario 6: cross-file integer + sibling plain-string field (interface)
  //
  // Build path: generateSchemasOrThrow({ typeName: "CrossFileMixedConfig" })
  //   succeeds; both @minimum on integer and @minLength/@maxLength on string work.
  //
  // KNOWN DIVERGENCE: snapshot path emits TYPE_MISMATCH on the integer field's
  // @minimum even when a sibling string field has string constraints.
  // -------------------------------------------------------------------------
  it("scenario 6: imported integer + sibling string field in interface — KNOWN DIVERGENCE: snapshot emits TYPE_MISMATCH, build path does not", () => {
    // Mirrors integer-type.test.ts "does not poison sibling string fields with
    // imported integer type constraints"
    const importingSource = [
      `import type { MultiBrandedInteger } from "${TYPES_FILE}";`,
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

    // KNOWN DIVERGENCE: build path → no TYPE_MISMATCH (both integer and string
    // constraints work). Snapshot path → TYPE_MISMATCH emitted for the integer
    // field's @minimum (bypass not applied). Pinning current snapshot behavior.
    expect(hasTypeMismatch(snapshot)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Scenario 7: cross-file integer + sibling plain-string field (type alias)
  //
  // Build path: generateSchemasOrThrow({ typeName: "CrossFileMixedTypeAlias" })
  //   succeeds; both fields work.
  //
  // KNOWN DIVERGENCE: snapshot path emits TYPE_MISMATCH on the integer field's
  // @minimum even in a type alias context.
  // -------------------------------------------------------------------------
  it("scenario 7: imported integer + sibling string field in type alias — KNOWN DIVERGENCE: snapshot emits TYPE_MISMATCH, build path does not", () => {
    // Mirrors integer-type.test.ts "does not poison sibling string fields in
    // type alias declarations"
    const importingSource = [
      `import type { MultiBrandedInteger } from "${TYPES_FILE}";`,
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

    // KNOWN DIVERGENCE: build path → no TYPE_MISMATCH. Snapshot path →
    // TYPE_MISMATCH emitted for the integer field's @minimum.
    // Pinning current snapshot behavior.
    expect(hasTypeMismatch(snapshot)).toBe(true);
  });
});
