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
 * Companion file: packages/analysis/tests/constraint-canaries.test.ts
 * covers the SNAPSHOT consumer — those `.fails` cases remain `.fails` until
 * Phase 3 (snapshot wiring).
 *
 * @see docs/refactors/synthetic-checker-retirement.md §4 Phase 2
 * @see docs/refactors/synthetic-checker-retirement.md §9.3 #14
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSchemas } from "../src/generators/class-schema.js";
import { type BuildFixtureDir, createBuildFixtureDir } from "./helpers/build-fixture-dir.js";

// =============================================================================
// Temp directory — shared across all build-consumer probe fixtures
// =============================================================================

let fixture: BuildFixtureDir;
/** Convenience alias — test bodies reference `tmpDir` as a string path. */
let tmpDir: string;

beforeAll(() => {
  fixture = createBuildFixtureDir("formspec-typed-parser-canary-");
  tmpDir = fixture.dirPath;
});

afterAll(() => {
  fixture.cleanup();
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
  it("emits INVALID_NUMERIC_VALUE for non-decimal argument (hex literal 0x10)", () => {
    // parseTagArgument("minimum", "0x10", "build") → INVALID_NUMERIC_VALUE
    // (DECIMAL_PATTERN rejects hex forms, 002 §3.2). The IR path and diagnostic
    // path now agree — 0x10 produces no constraint node (issue #513), so hover /
    // schema no longer silently report 16.
    const diagnostics = buildDiagnosticsFor("minimum", "0x10", "number", "hex-arg");
    const diagnostic = diagnostics.find((d) => d.code === "INVALID_NUMERIC_VALUE");
    expect(
      diagnostic,
      "Expected INVALID_NUMERIC_VALUE for hex literal from typed parser"
    ).toBeDefined();
  });
});

// =============================================================================
// Broadening bypass — typed parser must NOT fire for broadened (D1/D2) fields
//
// Fix: the hasBroadening check was moved BEFORE the parseTagArgument call
// (Phase 2 review fix #1). Before the fix, a broadened field with a typed-
// parser-rejectable argument would spuriously emit INVALID_TAG_ARGUMENT instead
// of being bypassed. This section guards against that regression.
// =============================================================================

describe("broadening bypass — typed parser must not fire for D1 broadened fields (build consumer)", () => {
  it("accepts @minimum 0x10 on an integer-branded type (D1 broadening — no INVALID_TAG_ARGUMENT)", () => {
    // Integer-branded types receive D1 broadening for numeric-comparable tags.
    // Before the fix, the typed parser ran before the hasBroadening check and
    // emitted INVALID_TAG_ARGUMENT for the hex literal. With the fix the field
    // is bypassed entirely and no diagnostic is emitted.
    // The brand key MUST be `__integerBrand` — that is what isIntegerBrandedType
    // (packages/build/src/analyzer/builtin-brands.ts) looks for. Using any other
    // brand name would not trigger D1 broadening.
    const source = [
      "declare const __integerBrand: unique symbol;",
      "type Integer = number & { readonly [__integerBrand]: true };",
      "export interface TestForm {",
      "  /** @minimum 0x10 */",
      "  value: Integer;",
      "}",
    ].join("\n");

    const safeName = "broadening-d1-minimum-hex";
    const fixturePath = path.join(tmpDir, `canary-${safeName}.ts`);
    fs.writeFileSync(fixturePath, source);

    const result = generateSchemas({
      filePath: fixturePath,
      typeName: "TestForm",
      errorReporting: "diagnostics",
    });

    // D1 broadened — the typed parser should not have fired.
    // The integer-branded bypass absorbs this entirely; no INVALID_TAG_ARGUMENT.
    expect(result.diagnostics.some((d) => d.code === "INVALID_TAG_ARGUMENT")).toBe(false);
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
    // This assertion is intentionally strict: INVALID_TAG_ARGUMENT confirms the typed
    // parser fires (Role C), NOT the synthetic checker (which would emit TYPE_MISMATCH).
    const diagnostics = buildDiagnosticsFor("uniqueItems", "false", "string[]", "false-arg");
    expect(
      diagnostics.some((d) => d.code === "INVALID_TAG_ARGUMENT"),
      "Expected INVALID_TAG_ARGUMENT from typed parser (Role C)"
    ).toBe(true);
    expect(
      diagnostics.some((d) => d.code === "TYPE_MISMATCH"),
      "Expected no TYPE_MISMATCH (synthetic checker must not fire)"
    ).toBe(false);
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
    // For a number field, the IR rejects the raw string value as a TYPE_MISMATCH.
    //
    // Two assertions are required:
    //   1. INVALID_TAG_ARGUMENT is absent — typed parser (Role C) passed through.
    //   2. TYPE_MISMATCH is present — proves the pipeline ran end-to-end and the
    //      IR-level check fired. Without this a broken/skipped typed-parser invocation
    //      would also satisfy assertion 1.
    const diagnostics = buildDiagnosticsFor("const", "not-json", "number", "not-json");
    const hasInvalidArg = diagnostics.some((d) => d.code === "INVALID_TAG_ARGUMENT");
    const hasTypeMismatch = diagnostics.some((d) => d.code === "TYPE_MISMATCH");
    expect(hasInvalidArg).toBe(false);
    expect(hasTypeMismatch).toBe(true);
  });
});

// =============================================================================
// Infinity/NaN normalization (§3, Phase 2)
// =============================================================================

describe("@minimum Infinity/NaN rejection (issue #513 — non-finite is a parse error)", () => {
  it("rejects @minimum Infinity on a number field with INVALID_NUMERIC_VALUE", () => {
    // Regression: `@minimum Infinity` used to pass through, producing
    // `minimum: Infinity` → JSON.stringify → `null` → schema invalid against the
    // meta-schema, with no diagnostic. It is now a parse error (002 §3.2).
    const diagnostics = buildDiagnosticsFor("minimum", "Infinity", "number", "infinity");
    expect(diagnostics.filter((d) => d.code === "INVALID_NUMERIC_VALUE")).toHaveLength(1);
  });

  it("rejects @minimum NaN on a number field with INVALID_NUMERIC_VALUE", () => {
    const diagnostics = buildDiagnosticsFor("minimum", "NaN", "number", "nan");
    expect(diagnostics.filter((d) => d.code === "INVALID_NUMERIC_VALUE")).toHaveLength(1);
  });
});
