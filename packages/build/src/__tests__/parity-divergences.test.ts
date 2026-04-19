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
import * as os from "node:os";
import * as path from "node:path";
import * as ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSchemas } from "../generators/class-schema.js";
import { buildFormSpecAnalysisFileSnapshot } from "@formspec/analysis/internal";

// =============================================================================
// Temp directory — shared across all build-path probe fixtures
// =============================================================================

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-parity-divergence-"));

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
});

afterAll(() => {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }
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
// Build path (renderSyntheticArgumentExpression, valueKind="json"):
//   JSON.parse("not-json") throws → JSON.stringify("not-json") = '"not-json"'
//   checkSyntheticTagApplication sees tag_const(ctx, "not-json").
//   JsonValue = unknown, so string passes the synthetic type check → no
//   synthetic diagnostic. But parseConstraintTagValue creates a ConstConstraintNode
//   with string value "not-json", which the IR validator rejects because
//   "not-json" is not compatible with the field type `number`.
//   Diagnostic: TYPE_MISMATCH with IR-level message
//     'Field "value": @const value type "string" is incompatible with field type "number"'
//
// Snapshot path (getArgumentExpression):
//   JSON.parse("not-json") throws → returns null (argument omitted from synthetic call).
//   The synthetic call becomes tag_const(ctx) without the required second argument.
//   Diagnostic: INVALID_TAG_ARGUMENT — "Expected 2-3 arguments, but got 1."
//
// KNOWN DIVERGENCE (refactor plan §3):
//   build:    '"not-json"' passes synthetic type check, but IR validator catches
//             the string-vs-number incompatibility as TYPE_MISMATCH.
//   snapshot: argument omitted; INVALID_TAG_ARGUMENT from synthetic type check.
//
// BEHAVIOR CHANGE from original analysis-package test: the original test assumed
// the build path produced NO diagnostic. That was incorrect — it called
// checkSyntheticTagApplication directly with generic hostType/subjectType,
// bypassing the IR validation stage. The real build pipeline DOES emit a
// diagnostic (TYPE_MISMATCH from the IR validator), just a different one
// than the snapshot path's INVALID_TAG_ARGUMENT.
//
// Phase 2/3 normalization should unify the error path: if the lowering
// already knew the argument was invalid JSON, it should reject early
// (matching snapshot behavior) rather than deferring to the IR validator.
// =============================================================================

describe("known divergence: @const not-json", () => {
  it("BUILD consumer: emits TYPE_MISMATCH from IR validator (string const incompatible with number field)", () => {
    // UPDATED DIVERGENCE (refactor plan §3): build produces TYPE_MISMATCH here,
    // NOT zero diagnostics as the original analysis-package test assumed.
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

  it("SNAPSHOT consumer: emits INVALID_TAG_ARGUMENT (argument is omitted when JSON parse fails)", () => {
    // KNOWN DIVERGENCE (refactor plan §3): snapshot produces INVALID_TAG_ARGUMENT here.
    // The snapshot path returns null for invalid JSON, omitting the argument from the
    // synthetic call. The call becomes tag_const(ctx) without the required value
    // argument, producing "Expected 2 arguments, but got 1."
    const source = `
      class Form {
        /** @const not-json */
        value!: number;
      }
    `;
    const snapshot = runSnapshotConsumer(source);

    const diagnostic = snapshot.diagnostics.find((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(diagnostic).toBeDefined();
    // The exact message is "Expected 2-3 arguments, but got 1." because the
    // @const tag has two overloads (direct and path-targeted), so TypeScript
    // reports a range. Pin the exact message to catch future signature changes.
    expect(diagnostic?.message).toBe("Expected 2-3 arguments, but got 1.");
    expect(diagnostic?.data["tagName"]).toBe("const");
  });
});

// =============================================================================
// Divergence case 2: @minimum Infinity
//
// Build path (renderSyntheticArgumentExpression, valueKind="number"):
//   Number.isFinite(Infinity) = false → JSON.stringify("Infinity") = '"Infinity"' (a string).
//   checkSyntheticTagApplication sees tag_minimum(ctx, "Infinity").
//   tag_minimum expects number; string is not assignable to number → TypeScript error.
//   buildCompilerBackedConstraintDiagnostics wraps the TypeScript error into:
//     code: TYPE_MISMATCH, message: 'Tag "@minimum" received an invalid argument for number.'
//
// Snapshot path (getArgumentExpression):
//   number-label branch → returns "Infinity" unchanged (passed as identifier).
//   Synthetic call: tag_minimum(ctx, Infinity). Infinity is typed as number → no diagnostic.
//
// KNOWN DIVERGENCE (refactor plan §3):
//   build:    Infinity stringified to '"Infinity"'; TYPE_MISMATCH from synthetic checker
//   snapshot: Infinity passed as identifier; no diagnostic
// Phase 2/3 normalization must pick one: treat Infinity as valid number, or reject it.
// =============================================================================

describe("known divergence: @minimum Infinity", () => {
  it("BUILD consumer: emits TYPE_MISMATCH (Infinity stringified to '\"Infinity\"', a string)", () => {
    // KNOWN DIVERGENCE (refactor plan §3): build produces TYPE_MISMATCH here.
    // renderSyntheticArgumentExpression (build path, valueKind="number"):
    //   Number.isFinite(Infinity) = false → JSON.stringify("Infinity") = '"Infinity"' (string).
    // tag_minimum expects number; string is not assignable to number → TypeScript error.
    // buildCompilerBackedConstraintDiagnostics wraps this into:
    //   code: TYPE_MISMATCH, message: 'Tag "@minimum" received an invalid argument for number.'
    const result = runBuildConsumer("minimum", "Infinity");

    expect(result.diagnostics.length).toBeGreaterThan(0);
    const diagnostic = result.diagnostics[0];
    expect(diagnostic?.code).toBe("TYPE_MISMATCH");
    // The FormSpec-level message is the stable contract, not the raw TypeScript message.
    // The message contains "invalid argument" and "number" (from capabilityLabel("number")).
    expect(diagnostic?.message).toContain("invalid argument");
    expect(diagnostic?.message).toContain("number");
  });

  it("SNAPSHOT consumer: no diagnostic (Infinity passed as identifier, typed as number)", () => {
    // KNOWN DIVERGENCE (refactor plan §3): snapshot produces NO diagnostic here.
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
// Build path (renderSyntheticArgumentExpression, valueKind="number"):
//   Number.isFinite(NaN) = false → JSON.stringify("NaN") = '"NaN"' (a string).
//   checkSyntheticTagApplication sees tag_minimum(ctx, "NaN").
//   tag_minimum expects number; string is not assignable to number → TypeScript error.
//   buildCompilerBackedConstraintDiagnostics wraps the TypeScript error into:
//     code: TYPE_MISMATCH, message: 'Tag "@minimum" received an invalid argument for number.'
//
// Snapshot path (getArgumentExpression):
//   number-label branch → returns "NaN" unchanged (passed as identifier).
//   Synthetic call: tag_minimum(ctx, NaN). NaN is typed as number → no diagnostic.
//
// KNOWN DIVERGENCE (refactor plan §3):
//   build:    NaN stringified to '"NaN"'; TYPE_MISMATCH from synthetic checker
//   snapshot: NaN passed as identifier; no diagnostic
// Phase 2/3 normalization must pick one: treat NaN as valid number arg, or reject it.
// =============================================================================

describe("known divergence: @minimum NaN", () => {
  it("BUILD consumer: emits TYPE_MISMATCH (NaN stringified to '\"NaN\"', a string)", () => {
    // KNOWN DIVERGENCE (refactor plan §3): build produces TYPE_MISMATCH here.
    // renderSyntheticArgumentExpression (build path, valueKind="number"):
    //   Number.isFinite(NaN) = false → JSON.stringify("NaN") = '"NaN"' (string).
    // tag_minimum expects number; string is not assignable to number → TypeScript error.
    // buildCompilerBackedConstraintDiagnostics wraps this into:
    //   code: TYPE_MISMATCH, message: 'Tag "@minimum" received an invalid argument for number.'
    // Same pattern as the Infinity case above.
    const result = runBuildConsumer("minimum", "NaN");

    expect(result.diagnostics.length).toBeGreaterThan(0);
    const diagnostic = result.diagnostics[0];
    expect(diagnostic?.code).toBe("TYPE_MISMATCH");
    expect(diagnostic?.message).toContain("invalid argument");
    expect(diagnostic?.message).toContain("number");
  });

  it("SNAPSHOT consumer: no diagnostic (NaN passed as identifier, typed as number)", () => {
    // KNOWN DIVERGENCE (refactor plan §3): snapshot produces NO diagnostic here.
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
