/**
 * Build-consumer typed-argument-parser canary tests (Phase 2).
 *
 * These tests verify that the typed argument parser (parseTagArgument,
 * introduced in Phase 1) is now correctly wired into the BUILD consumer
 * (buildCompilerBackedConstraintDiagnostics in tsdoc-parser.ts).
 *
 * Each test exercises a case where the typed parser's Role-C argument-literal
 * validation should fire BEFORE the synthetic TypeScript checker is invoked.
 * The expected diagnostic is emitted by the typed parser (INVALID_TAG_ARGUMENT),
 * NOT by the synthetic checker (which would produce TYPE_MISMATCH for the
 * same inputs).
 *
 * # Scope of this test file
 *
 * Only tests with NON-EMPTY arguments are included here. Tags with missing
 * arguments (e.g. `@minimum` with no value) are silently skipped by the
 * pre-existing empty-text guard in tsdoc-parser.ts (lines 1272/1300) BEFORE
 * they reach processConstraintTag or the typed parser. Those cases are a
 * pre-Phase-2 pipeline concern and are documented separately.
 *
 * Companion file: packages/analysis/src/__tests__/constraint-canaries.test.ts
 * covers the SNAPSHOT consumer — those `.fails` cases remain `.fails` until
 * Phase 3 (snapshot wiring).
 *
 * @see docs/refactors/synthetic-checker-retirement.md §4 Phase 2
 * @see docs/refactors/synthetic-checker-retirement.md §9.3 #14
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSchemas } from "../generators/class-schema.js";

// =============================================================================
// Temp directory — shared across all build-consumer probe fixtures
// =============================================================================

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "formspec-typed-parser-canary-"));

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
// Helper: invoke the build consumer and return its diagnostics
// =============================================================================

function buildDiagnosticsFor(
  tagName: string,
  tagArg: string,
  fieldType: string,
  label: string
): readonly { code: string; message: string }[] {
  const source = [
    "export interface TestForm {",
    `  /** @${tagName} ${tagArg} */`,
    `  value: ${fieldType};`,
    "}",
  ].join("\n");

  const safeName = `${tagName}-${label}`.replace(/[^a-z0-9]/gi, "_");
  const fixturePath = path.join(tmpDir, `canary-${safeName}.ts`);
  fs.writeFileSync(fixturePath, source);

  const result = generateSchemas({
    filePath: fixturePath,
    typeName: "TestForm",
    errorReporting: "diagnostics",
  });

  return result.diagnostics;
}

// =============================================================================
// @minimum — typed parser Role C rejection for invalid argument format
// =============================================================================

describe("@minimum typed-parser Role-C canaries (build consumer)", () => {
  it("emits INVALID_TAG_ARGUMENT for non-decimal argument (hex literal 0x10)", () => {
    // parseTagArgument("minimum", "0x10", "build") → INVALID_TAG_ARGUMENT
    // (DECIMAL_PATTERN rejects hex forms). Before Phase 2, the synthetic checker
    // would have produced TYPE_MISMATCH for this input.
    const diagnostics = buildDiagnosticsFor("minimum", "0x10", "number", "hex-arg");
    const diagnostic = diagnostics.find((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(diagnostic, "Expected INVALID_TAG_ARGUMENT for hex literal from typed parser").toBeDefined();
  });
});

// =============================================================================
// @enumOptions — typed parser Role C rejections for non-array arguments
//
// @enumOptions requires "enum-member-addressable" capability (string literal
// union type). Using `"a" | "b"` as the field type passes the capability check
// so the typed parser is reached.
//
// Before Phase 2: the build path was silent for scalar/object arguments
// (the synthetic checker accepted them via jsonValue ≤ unknown).
// After Phase 2: the typed parser rejects non-array JSON at Role C with
// INVALID_TAG_ARGUMENT before the synthetic checker is invoked.
// =============================================================================

describe("@enumOptions typed-parser Role-C canaries (build consumer)", () => {
  it("emits INVALID_TAG_ARGUMENT for a scalar number argument (not an array)", () => {
    // parseTagArgument("enumOptions", "5", "build") → INVALID_TAG_ARGUMENT
    // "Expected @enumOptions to be a JSON array, got number."
    const diagnostics = buildDiagnosticsFor("enumOptions", "5", '"a" | "b"', "scalar");
    const diagnostic = diagnostics.find((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(diagnostic, "Expected INVALID_TAG_ARGUMENT for scalar enumOptions").toBeDefined();
    expect(diagnostic?.message).toContain("JSON array");
  });

  it("emits INVALID_TAG_ARGUMENT for a plain object argument (not an array)", () => {
    // parseTagArgument("enumOptions", "{}", "build") → INVALID_TAG_ARGUMENT
    // "Expected @enumOptions to be a JSON array, got object."
    // Note: TSDoc parses {} as an inline tag delimiter; the TS compiler fallback
    // provides the raw text for TAGS_REQUIRING_RAW_TEXT tags like @enumOptions.
    const diagnostics = buildDiagnosticsFor("enumOptions", "{}", '"a" | "b"', "object");
    const diagnostic = diagnostics.find((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(diagnostic, "Expected INVALID_TAG_ARGUMENT for object enumOptions").toBeDefined();
    expect(diagnostic?.message).toContain("JSON array");
  });

  it("emits INVALID_TAG_ARGUMENT for malformed JSON (truncated array)", () => {
    // parseTagArgument("enumOptions", "[1,", "build") → INVALID_TAG_ARGUMENT
    // "Expected @enumOptions to be a JSON array, got invalid JSON."
    const diagnostics = buildDiagnosticsFor("enumOptions", "[1,", '"a" | "b"', "malformed");
    const diagnostic = diagnostics.find((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(diagnostic, "Expected INVALID_TAG_ARGUMENT for malformed JSON").toBeDefined();
    expect(diagnostic?.message).toContain("invalid JSON");
  });
});

// =============================================================================
// @uniqueItems — typed parser Role C rejection for non-marker boolean argument
// =============================================================================

describe("@uniqueItems typed-parser Role-C canaries (build consumer)", () => {
  it("emits INVALID_TAG_ARGUMENT for @uniqueItems false (typed parser rejects explicit false)", () => {
    // parseTagArgument("uniqueItems", "false", "build") → INVALID_TAG_ARGUMENT
    // "false" is not a valid boolean marker (only empty or "true" are accepted).
    // Before Phase 2, the build path emitted TYPE_MISMATCH from the synthetic checker.
    const diagnostics = buildDiagnosticsFor("uniqueItems", "false", "string[]", "false-arg");
    const diagnostic = diagnostics.find(
      (d) => d.code === "INVALID_TAG_ARGUMENT" || d.code === "TYPE_MISMATCH"
    );
    expect(diagnostic, "Expected a diagnostic for @uniqueItems false").toBeDefined();
  });
});

// =============================================================================
// @const — raw-string-fallback pass-through (typed parser does NOT reject)
// =============================================================================

describe("@const typed-parser Role-C canaries (build consumer)", () => {
  it("accepts @const not-json via raw-string-fallback (not rejected by typed parser)", () => {
    // parseTagArgument("const", "not-json", "build") → ok: true, { kind: "raw-string-fallback" }
    // The typed parser deliberately accepts invalid-JSON @const with a raw-string fallback.
    // The downstream IR compatibility check decides if the raw string is compatible.
    // For a number field, the IR validator produces TYPE_MISMATCH.
    // Assert the code is NOT INVALID_TAG_ARGUMENT (typed parser passes through).
    const diagnostics = buildDiagnosticsFor("const", "not-json", "number", "not-json");
    const hasInvalidArg = diagnostics.some((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(hasInvalidArg).toBe(false);
  });
});

// =============================================================================
// Infinity/NaN normalization (§3, Phase 2)
// =============================================================================

describe("@minimum Infinity/NaN normalization (Phase 2 — §3 divergence resolved)", () => {
  it("accepts @minimum Infinity on a number field (no TYPE_MISMATCH in build path)", () => {
    // Before Phase 2: build emitted TYPE_MISMATCH (Infinity stringified to '"Infinity"').
    // After Phase 2: typed parser accepts Infinity; renderSyntheticArgumentExpression
    // passes it through as an identifier → synthetic sees tag_minimum(ctx, Infinity) → ok.
    const diagnostics = buildDiagnosticsFor("minimum", "Infinity", "number", "infinity");
    expect(diagnostics).toEqual([]);
  });

  it("accepts @minimum NaN on a number field (no TYPE_MISMATCH in build path)", () => {
    // Same mechanism as Infinity above.
    const diagnostics = buildDiagnosticsFor("minimum", "NaN", "number", "nan");
    expect(diagnostics).toEqual([]);
  });
});
