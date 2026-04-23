/**
 * Pinned tests for the three known build/snapshot consumer divergences.
 *
 * Background: the build path (`renderSyntheticArgumentExpression` in
 * `packages/build/src/analyzer/tsdoc-parser.ts`) and the snapshot path
 * (`getArgumentExpression` in `packages/analysis/src/file-snapshots.ts`)
 * lower tag argument text into TypeScript expressions differently for a small
 * set of inputs. Each case below asserts the EXACT diagnostic output each
 * consumer produces today.
 *
 * These tests are anchors for the Phase 2/3 normalization work: once a
 * `lowering: "build" | "snapshot"` flag is introduced in the typed-argument
 * parser, these tests confirm the per-consumer semantics are preserved until
 * an explicit normalization PR picks one authority per case.
 *
 * NOTE — test placement: This file lives in `packages/build` rather than
 * `packages/analysis` so the build-side probe can invoke the REAL build
 * lowering path (`generateSchemas` → `parseTSDocTags` →
 * `buildCompilerBackedConstraintDiagnostics` → `renderSyntheticArgumentExpression`)
 * instead of a local reimplementation. `@formspec/analysis` has no dependency
 * on `@formspec/build`, so the test must live where both paths are accessible.
 *
 * @see docs/refactors/synthetic-checker-retirement.md §3 — divergence table
 * @see docs/refactors/synthetic-checker-retirement.md §9.3 #16 — test action
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSchemas } from "../src/generators/class-schema.js";
import { buildFormSpecAnalysisFileSnapshot } from "@formspec/analysis/internal";
import { type BuildFixtureDir, createBuildFixtureDir } from "./helpers/build-fixture-dir.js";

// =============================================================================
// Temp directory — shared across all build-path probe fixtures
// =============================================================================

let fixture: BuildFixtureDir;
/** Convenience alias — test bodies reference `tmpDir` as a string path. */
let tmpDir: string;

beforeAll(() => {
  fixture = createBuildFixtureDir("formspec-parity-divergence-");
  tmpDir = fixture.dirPath;
});

afterAll(() => {
  fixture.cleanup();
});

// =============================================================================
// Helper: invoke the BUILD consumer path.
//
// Routes through the REAL build lowering pipeline:
//   generateSchemas (errorReporting: "diagnostics")
//     → analyzeNamedTypeToIRFromProgramContextDetailed
//     → analyzeInterfaceToIR
//     → parseTSDocTags
//     → buildCompilerBackedConstraintDiagnostics
//     → renderSyntheticArgumentExpression      ← the lowering divergence point
//     → checkSyntheticTagApplication
//   plus, when the synthetic check passes:
//     → parseConstraintTagValue → ConstraintNode in the IR
//     → validateIR (IR-level type validation)
//
// This is the authoritative build behavior, NOT a reimplementation of
// renderSyntheticArgumentExpression. If renderSyntheticArgumentExpression or
// any other step in the pipeline changes, these tests will catch the regression.
// =============================================================================

function runBuildConsumer(
  tagName: string,
  value: string
): { diagnostics: readonly { code: string; message: string }[] } {
  const source = [
    "export interface TestForm {",
    `  /** @${tagName} ${value} */`,
    "  value: number;",
    "}",
  ].join("\n");

  // Write a unique fixture per call so parallel test runs don't collide.
  const safeName = value.replace(/[^a-z0-9]/gi, "_");
  const fixturePath = path.join(tmpDir, `probe-${tagName}-${safeName}.ts`);
  fs.writeFileSync(fixturePath, source);

  const result = generateSchemas({
    filePath: fixturePath,
    typeName: "TestForm",
    errorReporting: "diagnostics",
  });

  return { diagnostics: result.diagnostics };
}

// =============================================================================
// Helper: invoke the SNAPSHOT consumer path.
//
// Uses the analysis-layer snapshot builder directly (no build package involvement).
// Creates an in-memory TypeScript program so no disk I/O is required.
// The snapshot path uses `getArgumentExpression` in file-snapshots.ts, which
// has different lowering semantics for non-finite numbers and invalid JSON.
// =============================================================================

function createInMemoryProgram(sourceText: string, fileName = "/virtual/parity-divergence.ts") {
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
    if (requestedFileName === fileName) {
      return ts.createSourceFile(fileName, sourceText, languageVersion, true, ts.ScriptKind.TS);
    }
    return originalGetSourceFile(requestedFileName, languageVersion);
  };
  host.readFile = (requestedFileName) =>
    requestedFileName === fileName ? sourceText : originalReadFile(requestedFileName);
  host.fileExists = (requestedFileName) =>
    requestedFileName === fileName || originalFileExists(requestedFileName);
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  host.writeFile = () => {};

  const program = ts.createProgram([fileName], compilerOptions, host);
  const sourceFile = program.getSourceFile(fileName);
  if (sourceFile === undefined) {
    throw new Error("Expected virtual source file");
  }

  return { checker: program.getTypeChecker(), sourceFile };
}

function runSnapshotConsumer(source: string) {
  const { checker, sourceFile } = createInMemoryProgram(source, "/virtual/parity-divergence.ts");
  return buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });
}

// =============================================================================
// Divergence case 1: @const not-json
//
// PHASE 5B UPDATE — divergence NORMALIZED (2026-04-21):
//
// Before Phase 5B (build path — unchanged):
//   renderSyntheticArgumentExpression (valueKind="json"):
//     JSON.parse("not-json") throws → JSON.stringify("not-json") = '"not-json"'
//   checkSyntheticTagApplication: tag_const(ctx, "not-json") passes (string ≤ unknown).
//   parseConstraintTagValue: ConstConstraintNode with string value "not-json".
//   validateIR (semantic-targets.ts case "const"): rejects because string value
//   is incompatible with field type `number` → TYPE_MISMATCH.
//
// Before Phase 5B (snapshot path):
//   parseTagArgument("const", "not-json", "snapshot") → ok: true, raw-string-fallback.
//   getArgumentExpression (valueLabels includes "json"): JSON.parse throws → null.
//   Synthetic call is missing the argument → arity error "Expected 2-3 arguments,
//   but got 1." → INVALID_TAG_ARGUMENT.
//
// After Phase 5B (snapshot path — this is the change):
//   parseTagArgument("const", "not-json", "snapshot") → ok: true, raw-string-fallback
//   with value "not-json" (string).
//   _checkConstValueAgainstType("not-json", number-typed field, checker) →
//   TYPE_MISMATCH with message '@const value type "string" is incompatible with
//   field type "number"' — matching the build consumer's IR-validator message
//   (minus the build path's `Field "<name>":` prefix).
//
// NORMALIZED: both consumers now produce TYPE_MISMATCH. The §3 catalogue entry
// for `@const not-json` is resolved by Phase 5B.
//
// @see docs/refactors/synthetic-checker-retirement.md §4 Phase 5B
// @see packages/analysis/src/constraint-applicability.ts _checkConstValueAgainstType
// =============================================================================

describe("normalized: @const not-json (Phase 5B — both consumers emit TYPE_MISMATCH)", () => {
  it("BUILD consumer: emits TYPE_MISMATCH from IR validator (string const incompatible with number field)", () => {
    // Build path (unchanged): IR validator rejects at validateIR time.
    //
    // renderSyntheticArgumentExpression (build path, valueKind="json"):
    //   JSON.parse("not-json") throws → JSON.stringify("not-json") = '"not-json"'
    // checkSyntheticTagApplication: tag_const(ctx, "not-json") passes (string ≤ unknown).
    // parseConstraintTagValue: creates ConstConstraintNode with value "not-json" (string).
    // validateIR: rejects because string const is incompatible with field type number.
    // Message: 'Field "value": @const value type "string" is incompatible with field type "number"'
    const result = runBuildConsumer("const", "not-json");

    expect(result.diagnostics.length).toBeGreaterThan(0);
    const diagnostic = result.diagnostics[0];
    expect(diagnostic?.code).toBe("TYPE_MISMATCH");
    // The message comes from the IR validator, not the synthetic checker.
    // It reports the value type ("string") and the field type ("number").
    // Pin substrings that are stable without over-coupling to exact wording.
    expect(diagnostic?.message).toContain("string");
    expect(diagnostic?.message).toContain("number");
  });

  it("SNAPSHOT consumer: emits TYPE_MISMATCH from @const IR check (Phase 5B — now matches build)", () => {
    // Phase 5B: the snapshot consumer's @const IR check runs after Role-C
    // accepts the raw-string-fallback value. The value's typeof ("string")
    // does not match the number field's primitive kind → TYPE_MISMATCH with
    // the same textual payload (minus the field-name prefix) as the build
    // consumer's semantic-targets.ts case "const".
    const source = `
      class Form {
        /** @const not-json */
        value!: number;
      }
    `;
    const snapshot = runSnapshotConsumer(source);

    const diagnostic = snapshot.diagnostics.find((d) => d.code === "TYPE_MISMATCH");
    expect(diagnostic).toBeDefined();
    // Pin the exact message the snapshot consumer produces (without the build
    // path's `Field "<name>":` prefix).
    expect(diagnostic?.message).toBe(
      '@const value type "string" is incompatible with field type "number"'
    );
    expect(diagnostic?.data["tagName"]).toBe("const");

    // Phase 5B guarantees the synthetic arity error no longer surfaces for
    // this input — the @const IR check short-circuits the synthetic call.
    expect(
      snapshot.diagnostics.some(
        (d) =>
          d.code === "INVALID_TAG_ARGUMENT" &&
          typeof d.message === "string" &&
          d.message.includes("arguments")
      ),
      "Expected no synthetic arity error — @const IR check short-circuits the synthetic call"
    ).toBe(false);
  });
});

// =============================================================================
// Divergence case 2: @minimum Infinity
//
// PHASE 2 UPDATE — divergence NORMALIZED:
//
// Before Phase 2 (build path, renderSyntheticArgumentExpression, valueKind="number"):
//   Number.isFinite(Infinity) = false → JSON.stringify("Infinity") = '"Infinity"' (a string).
//   checkSyntheticTagApplication sees tag_minimum(ctx, "Infinity").
//   tag_minimum expects number; string is not assignable to number → TYPE_MISMATCH.
//
// After Phase 2 (build path):
//   parseTagArgument("minimum", "Infinity", "build") → ok: true, { kind: "number", value: Infinity }
//   renderSyntheticArgumentExpression now passes "Infinity" through as an identifier
//   (not a quoted string), aligning with the snapshot path.
//   checkSyntheticTagApplication sees tag_minimum(ctx, Infinity).
//   Infinity is typed as number → no diagnostic.
//
// Snapshot path (getArgumentExpression, unchanged):
//   number-label branch → returns "Infinity" unchanged (passed as identifier).
//   Synthetic call: tag_minimum(ctx, Infinity). Infinity is typed as number → no diagnostic.
//
// NORMALIZED (refactor plan §3, Phase 2): both consumers now accept Infinity.
// The §3 catalogue entry is resolved. The §4 Phase 2 work (typed-parser wiring +
// renderSyntheticArgumentExpression fix) aligned the build path with snapshot.
// =============================================================================

describe("normalized: @minimum Infinity (both consumers accept, Phase 2)", () => {
  it("BUILD consumer: no diagnostic (Infinity passed as identifier after Phase 2 fix)", () => {
    // NORMALIZED (refactor plan §3): build now produces NO diagnostic here.
    // Phase 2 changes:
    //   1. parseTagArgument("minimum", "Infinity", "build") → ok: true (typed parser accepts)
    //   2. renderSyntheticArgumentExpression now passes "Infinity" as-is (not quoted)
    //   3. checkSyntheticTagApplication sees tag_minimum(ctx, Infinity) → number → no error
    const result = runBuildConsumer("minimum", "Infinity");
    expect(result.diagnostics).toEqual([]);
  });

  it("SNAPSHOT consumer: no diagnostic (Infinity passed as identifier, typed as number)", () => {
    // UNCHANGED (refactor plan §3): snapshot produces NO diagnostic here.
    // getArgumentExpression: number-label branch → returns "Infinity" unchanged.
    // In the synthetic program, Infinity is a well-known global of type `number`,
    // so tag_minimum(ctx, Infinity) type-checks correctly.
    const source = `
      class Form {
        /** @minimum Infinity */
        value!: number;
      }
    `;
    const snapshot = runSnapshotConsumer(source);
    expect(snapshot.diagnostics).toEqual([]);
  });
});

// =============================================================================
// Divergence case 3: @minimum NaN
//
// PHASE 2 UPDATE — divergence NORMALIZED:
//
// Before Phase 2 (build path, renderSyntheticArgumentExpression, valueKind="number"):
//   Number.isFinite(NaN) = false → JSON.stringify("NaN") = '"NaN"' (a string).
//   checkSyntheticTagApplication sees tag_minimum(ctx, "NaN").
//   tag_minimum expects number; string is not assignable to number → TYPE_MISMATCH.
//
// After Phase 2 (build path):
//   parseTagArgument("minimum", "NaN", "build") → ok: true, { kind: "number", value: NaN }
//   renderSyntheticArgumentExpression now passes "NaN" through as an identifier
//   (not a quoted string), aligning with the snapshot path.
//   checkSyntheticTagApplication sees tag_minimum(ctx, NaN).
//   NaN is typed as number → no diagnostic.
//
// Snapshot path (getArgumentExpression, unchanged):
//   number-label branch → returns "NaN" unchanged (passed as identifier).
//   Synthetic call: tag_minimum(ctx, NaN). NaN is typed as number → no diagnostic.
//
// NORMALIZED (refactor plan §3, Phase 2): both consumers now accept NaN.
// The §3 catalogue entry is resolved. Same mechanism as the Infinity case above.
// =============================================================================

describe("normalized: @minimum NaN (both consumers accept, Phase 2)", () => {
  it("BUILD consumer: no diagnostic (NaN passed as identifier after Phase 2 fix)", () => {
    // NORMALIZED (refactor plan §3): build now produces NO diagnostic here.
    // Phase 2 changes:
    //   1. parseTagArgument("minimum", "NaN", "build") → ok: true (typed parser accepts)
    //   2. renderSyntheticArgumentExpression now passes "NaN" as-is (not quoted)
    //   3. checkSyntheticTagApplication sees tag_minimum(ctx, NaN) → number → no error
    const result = runBuildConsumer("minimum", "NaN");
    expect(result.diagnostics).toEqual([]);
  });

  it("SNAPSHOT consumer: no diagnostic (NaN passed as identifier, typed as number)", () => {
    // UNCHANGED (refactor plan §3): snapshot produces NO diagnostic here.
    // getArgumentExpression: number-label branch → returns "NaN" unchanged.
    // In the synthetic program, NaN is a well-known global of type `number`,
    // so tag_minimum(ctx, NaN) type-checks correctly.
    const source = `
      class Form {
        /** @minimum NaN */
        value!: number;
      }
    `;
    const snapshot = runSnapshotConsumer(source);
    expect(snapshot.diagnostics).toEqual([]);
  });
});
