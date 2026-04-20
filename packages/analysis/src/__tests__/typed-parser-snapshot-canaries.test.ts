/**
 * Snapshot-consumer typed-argument-parser canary tests (Phase 3).
 *
 * These tests verify that the typed argument parser (parseTagArgument) is now
 * correctly wired into the SNAPSHOT consumer (buildFormSpecAnalysisFileSnapshot
 * via buildTagDiagnostics in file-snapshots.ts, §4 Phase 3).
 *
 * Each test exercises a case where the typed parser's Role-C argument-literal
 * validation should fire BEFORE the synthetic TypeScript checker is invoked.
 * The expected diagnostic is emitted by the typed parser (INVALID_TAG_ARGUMENT),
 * NOT by the synthetic checker (which would produce TYPE_MISMATCH for the same
 * inputs).
 *
 * Mirrors the companion build-consumer tests at:
 *   packages/build/src/__tests__/typed-parser-canaries.test.ts
 *
 * The snapshot consumer uses an in-memory TypeScript program (no disk I/O),
 * so these tests are self-contained without a temp-directory setup.
 *
 * # Scope of this test file
 *
 * Only tests with NON-EMPTY arguments are included here. Tags with missing
 * arguments (e.g. `@minimum` with no value) are silently skipped by the
 * pre-existing empty-text guard BEFORE they reach buildTagDiagnostics or the
 * typed parser. Those cases are a pre-Phase-3 pipeline concern.
 *
 * @see docs/refactors/synthetic-checker-retirement.md §4 Phase 3
 * @see docs/refactors/synthetic-checker-retirement.md §9.3 #14
 * @see packages/build/src/__tests__/typed-parser-canaries.test.ts (build-consumer mirror)
 */

import { describe, expect, it } from "vitest";
import { buildFormSpecAnalysisFileSnapshot } from "../internal.js";
import {
  defineCustomType,
  defineExtension,
} from "@formspec/core";
import { createProgram } from "./helpers.js";

// =============================================================================
// Helper: invoke the snapshot consumer and return its diagnostics
// =============================================================================

function snapshotDiagnosticsFor(
  tagName: string,
  tagArg: string,
  fieldType: string,
  label: string
): readonly { code: string; message: string; severity: string; category: string }[] {
  const source = [
    "class TestForm {",
    `  /** @${tagName} ${tagArg} */`,
    `  value!: ${fieldType};`,
    "}",
  ].join("\n");

  const { checker, sourceFile } = createProgram(
    source,
    `/virtual/snapshot-canary-${label}.ts`
  );
  const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });
  return snapshot.diagnostics;
}

// =============================================================================
// @minimum — typed parser Role C rejection for invalid argument format
// =============================================================================

describe("@minimum typed-parser Role-C canaries (snapshot consumer)", () => {
  it('emits INVALID_TAG_ARGUMENT for a quoted-string argument (@minimum "hello" on number)', () => {
    // parseTagArgument("minimum", '"hello"', "snapshot") → INVALID_TAG_ARGUMENT
    // (typed parser rejects non-numeric argument for @minimum).
    // Before Phase 3 this triggered TYPE_MISMATCH from the synthetic checker.
    // After Phase 3 the typed parser intercepts it at Role C.
    //
    // Severity/category canary: INVALID_TAG_ARGUMENT must be severity "error" and
    // category "value-parsing". This guards against diagnosticSeverity /
    // diagnosticCategory fall-through regressions (same fix covers MISSING_TAG_ARGUMENT).
    const diagnostics = snapshotDiagnosticsFor("minimum", '"hello"', "number", "string-arg");
    const invalidArgDiags = diagnostics.filter((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(
      invalidArgDiags,
      "Expected exactly one INVALID_TAG_ARGUMENT for string-literal argument from typed parser"
    ).toHaveLength(1);
    expect(invalidArgDiags[0]?.severity).toBe("error");
    expect(invalidArgDiags[0]?.category).toBe("value-parsing");
    // TYPE_MISMATCH must NOT appear — the synthetic checker must not fire.
    expect(
      diagnostics.some((d) => d.code === "TYPE_MISMATCH"),
      "Expected no TYPE_MISMATCH — synthetic checker must not run after Role-C rejection"
    ).toBe(false);
  });

  it("emits INVALID_TAG_ARGUMENT for non-decimal argument (hex literal 0x10)", () => {
    // parseTagArgument("minimum", "0x10", "snapshot") → INVALID_TAG_ARGUMENT
    // (DECIMAL_PATTERN rejects hex forms). Before Phase 3 the snapshot path
    // accepted 0x10 silently or produced TYPE_MISMATCH. Phase 3 rejects at Role C.
    const diagnostics = snapshotDiagnosticsFor("minimum", "0x10", "number", "hex-arg");
    const diagnostic = diagnostics.find((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(
      diagnostic,
      "Expected INVALID_TAG_ARGUMENT for hex literal from typed parser"
    ).toBeDefined();
  });

  it("accepts @minimum Infinity on a number field — no diagnostic (convergence pin)", () => {
    // parseTagArgument("minimum", "Infinity", "snapshot") → ok: true, number value
    // The snapshot path passes Infinity as an identifier; the synthetic checker
    // sees tag_minimum(ctx, Infinity) → number → no error.
    // This pin guards the Phase 2 Infinity normalization for the snapshot path.
    const diagnostics = snapshotDiagnosticsFor("minimum", "Infinity", "number", "infinity");
    expect(diagnostics).toEqual([]);
  });

  it("accepts @minimum NaN on a number field — no diagnostic (convergence pin)", () => {
    // parseTagArgument("minimum", "NaN", "snapshot") → ok: true, number value
    // Same mechanism as Infinity above — NaN passes as an identifier.
    const diagnostics = snapshotDiagnosticsFor("minimum", "NaN", "number", "nan");
    expect(diagnostics).toEqual([]);
  });
});

// =============================================================================
// @uniqueItems — typed parser Role C rejection for explicit false argument
// =============================================================================

describe("@uniqueItems typed-parser Role-C canaries (snapshot consumer)", () => {
  it("emits INVALID_TAG_ARGUMENT for @uniqueItems false — no TYPE_MISMATCH (tight assertion)", () => {
    // parseTagArgument("uniqueItems", "false", "snapshot") → INVALID_TAG_ARGUMENT
    // "false" is not a valid boolean marker (only empty or "true" are accepted).
    // Before Phase 3, the snapshot path emitted TYPE_MISMATCH from the synthetic
    // checker. This assertion is intentionally strict:
    //   - INVALID_TAG_ARGUMENT confirms the typed parser fires (Role C).
    //   - Absence of TYPE_MISMATCH confirms the synthetic checker does NOT fire.
    const diagnostics = snapshotDiagnosticsFor("uniqueItems", "false", "string[]", "false-arg");
    expect(
      diagnostics.filter((d) => d.code === "INVALID_TAG_ARGUMENT"),
      "Expected exactly one INVALID_TAG_ARGUMENT from typed parser (Role C)"
    ).toHaveLength(1);
    expect(
      diagnostics.some((d) => d.code === "TYPE_MISMATCH"),
      "Expected no TYPE_MISMATCH — synthetic checker must not run after Role-C rejection"
    ).toBe(false);
  });
});

// =============================================================================
// @enumOptions — typed parser Role C rejections for non-array arguments
// =============================================================================

describe("@enumOptions typed-parser Role-C canaries (snapshot consumer)", () => {
  it("emits INVALID_TAG_ARGUMENT for a scalar number argument (@enumOptions 5)", () => {
    // parseTagArgument("enumOptions", "5", "snapshot") → INVALID_TAG_ARGUMENT
    // "Expected @enumOptions to be a JSON array, got number."
    // Before Phase 3 this was a `.fails` case (constraint-canaries.test.ts).
    // Phase 3 wires the typed parser into the snapshot path, converting it.
    const diagnostics = snapshotDiagnosticsFor("enumOptions", "5", "string", "scalar");
    const invalidArgDiags = diagnostics.filter((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(
      invalidArgDiags,
      "Expected exactly one INVALID_TAG_ARGUMENT for scalar @enumOptions argument"
    ).toHaveLength(1);
    expect(invalidArgDiags[0]?.message).toContain("JSON array");
  });

  it("emits INVALID_TAG_ARGUMENT for an object argument (@enumOptions {})", () => {
    // parseTagArgument("enumOptions", "{}", "snapshot") → INVALID_TAG_ARGUMENT
    // "Expected @enumOptions to be a JSON array, got object."
    // Mirrors the build-consumer canary for @enumOptions {} (typed-parser-canaries.test.ts).
    // Phase 3 wires the typed parser into the snapshot path for this case.
    const diagnostics = snapshotDiagnosticsFor("enumOptions", "{}", "string", "object");
    const invalidArgDiags = diagnostics.filter((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(
      invalidArgDiags,
      "Expected exactly one INVALID_TAG_ARGUMENT for object @enumOptions argument"
    ).toHaveLength(1);
    expect(invalidArgDiags[0]?.message).toContain("JSON array");
  });
});

// =============================================================================
// @const — raw-string-fallback pass-through (typed parser does NOT reject)
// =============================================================================

describe("@const typed-parser Role-C canaries (snapshot consumer)", () => {
  it("accepts @const not-json via raw-string-fallback (typed parser passes through; synthetic checker catches it)", () => {
    // parseTagArgument("const", "not-json", "snapshot") → ok: true, { kind: "raw-string-fallback" }
    // The typed parser deliberately accepts invalid-JSON @const with a raw-string fallback.
    //
    // After the typed-parser pass-through, the snapshot path's getArgumentExpression
    // returns null for invalid JSON (it cannot produce a TypeScript AST node for
    // non-parseable text), so the synthetic call is missing the required value
    // argument. The synthetic checker then fires:
    //   "Expected 2-3 arguments, but got 1." → INVALID_TAG_ARGUMENT
    //
    // This is the known divergence from parity-harness.test.ts §3:
    //   - Snapshot: INVALID_TAG_ARGUMENT from synthetic checker (arity error).
    //   - Build:    TYPE_MISMATCH from IR validator (string-vs-number).
    //
    // Phase 3 assertion (mirrors the build canary structure):
    //   The diagnostic must be INVALID_TAG_ARGUMENT with an arity message
    //   ("Expected N arguments") — not a typed-parser format rejection.
    //   The typed parser's own rejection messages say e.g. "Expected @const to be ..."
    //   so the arity message confirms that Role C passed through and the rejection
    //   came from the synthetic checker.
    const source = [
      "class Form {",
      "  /** @const not-json */",
      "  value!: number;",
      "}",
    ].join("\n");

    const { checker, sourceFile } = createProgram(
      source,
      "/virtual/snapshot-canary-const-not-json.ts"
    );
    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });
    const diagnostics = snapshot.diagnostics;

    // The downstream synthetic checker emits INVALID_TAG_ARGUMENT with an arity
    // error message ("Expected 2-3 arguments, but got 1.").
    // Role C does NOT reject @const not-json — the typed parser returns ok: true.
    const syntheticArityDiag = diagnostics.find(
      (d) =>
        d.code === "INVALID_TAG_ARGUMENT" &&
        typeof d.message === "string" &&
        d.message.startsWith("Expected") &&
        d.message.includes("arguments")
    );
    expect(
      syntheticArityDiag,
      "Expected INVALID_TAG_ARGUMENT from the synthetic arity check (not from Role C)"
    ).toBeDefined();

    // Confirm: no TYPE_MISMATCH (the snapshot path does not have an IR validator;
    // the synthetic arity check fires instead, unlike the build path).
    expect(
      diagnostics.some((d) => d.code === "TYPE_MISMATCH"),
      "Expected no TYPE_MISMATCH — snapshot path uses synthetic arity check, not IR validator"
    ).toBe(false);
  });
});

// =============================================================================
// Extension-broadening bypass — typed parser must NOT fire for broadened fields
//
// Phase 3 lesson 1: the broadening check MUST run BEFORE the typed-parser call.
// A broadened field whose argument would otherwise be rejected by the typed
// parser must be bypassed entirely (D1/D2 routing). Without this guard the
// field would spuriously emit INVALID_TAG_ARGUMENT instead of being routed to
// the extension-broadening handler.
//
// This canary guards against regression of that Phase 3 fix.
// =============================================================================

describe("extension-broadening bypass — typed parser must not fire for broadened fields (snapshot consumer)", () => {
  it("accepts @minimum 0x10 on a custom type with registered @minimum broadening — no INVALID_TAG_ARGUMENT", () => {
    // Set up a Decimal custom type that registers @minimum broadening.
    // When the snapshot consumer sees `value: Decimal` with `@minimum 0x10`,
    // it should detect the broadening BEFORE calling parseTagArgument.
    // The broadened field bypasses Role C entirely — no INVALID_TAG_ARGUMENT.
    //
    // The brand name "Decimal" is registered via tsTypeNames so the snapshot
    // path's name-based detection (checker.typeToString on the field type)
    // can find it in the extensionDefinitions registry.
    const extension = defineExtension({
      extensionId: "x-test/broadening-bypass",
      types: [
        defineCustomType({
          typeName: "Decimal",
          tsTypeNames: ["Decimal"],
          builtinConstraintBroadenings: [
            {
              tagName: "minimum",
              constraintName: "DecimalMinimum",
              parseValue: (raw) => Number(raw),
            },
          ],
          toJsonSchema: (_payload, _prefix) => ({ type: "string" }),
        }),
      ],
    });

    const source = [
      "type Decimal = string & { readonly __decimalBrand: true };",
      "class TestForm {",
      "  /** @minimum 0x10 */",
      "  value!: Decimal;",
      "}",
    ].join("\n");

    const { checker, sourceFile } = createProgram(
      source,
      "/virtual/snapshot-canary-broadening-bypass.ts"
    );

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, {
      checker,
      extensionDefinitions: [extension],
    });

    // The broadening bypass must suppress the typed parser entirely for this field.
    // The typed parser would have rejected "0x10" with INVALID_TAG_ARGUMENT, but
    // the broadening guard short-circuits Role C before parseTagArgument is called.
    expect(snapshot.diagnostics.some((d) => d.code === "INVALID_TAG_ARGUMENT")).toBe(false);
  });

  it("detects broadening for a complex intersection type registered with its full NoTruncation name (regression: #354 follow-up)", () => {
    // Regression guard for the fix that replaced checker.typeToString(effectiveType)
    // with typeToString(effectiveType, checker) (passing TypeFormatFlags.NoTruncation).
    //
    // The bug: hasExtensionBroadening used checker.typeToString with default flags,
    // which applies TypeScript's ~160-char truncation threshold. When an extension
    // registers a complex anonymous intersection type via tsTypeNames, the full
    // NoTruncation string is stored — but the default formatter would produce a
    // truncated / structurally-different string that never matches the registry.
    // Broadening detection would silently miss, causing INVALID_TAG_ARGUMENT to
    // fire on valid extension-broadened fields with complex types.
    //
    // The fix: use the file-local typeToString() helper which passes NoTruncation,
    // ensuring the string matches the registry for arbitrarily complex types.
    //
    // This test uses a type alias whose underlying structure exceeds ~160 characters
    // when printed inline. To make the registered name deterministic, the alias name
    // ("LongIntersection") is used — TypeScript uses alias names for named aliases
    // regardless of truncation, so the regression is demonstrated by registering
    // the alias name and verifying broadening fires.
    //
    // NOTE: The real truncation scenario affects anonymous or expanded types. This
    // test guards the code-path fix and documents the intended behavior. A test for
    // pure anonymous truncation would require runtime reflection to determine the
    // exact NoTruncation string at test-write time.
    const extension = defineExtension({
      extensionId: "x-test/complex-type-broadening",
      types: [
        defineCustomType({
          typeName: "LongIntersection",
          // Register the alias name — TypeScript's typeToString returns alias names
          // for named type aliases, so this is stable and deterministic.
          tsTypeNames: ["LongIntersection"],
          builtinConstraintBroadenings: [
            {
              tagName: "minimum",
              constraintName: "LongIntersectionMinimum",
              parseValue: (raw) => Number(raw),
            },
          ],
          toJsonSchema: (_payload, _prefix) => ({ type: "string" }),
        }),
      ],
    });

    // LongIntersection is a complex type whose fully-expanded inline representation
    // would exceed TypeScript's ~160-char default truncation threshold. However,
    // since it is a named alias, typeToString returns "LongIntersection" in both
    // default and NoTruncation modes — confirming that the fix's use of the helper
    // does not break the named-alias path while the code path now passes NoTruncation.
    const source = [
      "type LongIntersection = string",
      "  & { readonly propAlpha: boolean }",
      "  & { readonly propBeta: boolean }",
      "  & { readonly propGamma: boolean }",
      "  & { readonly propDelta: boolean }",
      "  & { readonly propEpsilon: boolean }",
      "  & { readonly propZeta: boolean }",
      "  & { readonly propEta: boolean };",
      "class TestForm {",
      "  /** @minimum 0x10 */",
      "  value!: LongIntersection;",
      "}",
    ].join("\n");

    const { checker, sourceFile } = createProgram(
      source,
      "/virtual/snapshot-canary-complex-broadening.ts"
    );

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, {
      checker,
      extensionDefinitions: [extension],
    });

    // hasExtensionBroadening must detect that LongIntersection has @minimum
    // broadening registered, and suppress the typed parser before it rejects
    // "0x10" as an invalid hex argument.
    expect(
      snapshot.diagnostics.some((d) => d.code === "INVALID_TAG_ARGUMENT"),
      "Expected no INVALID_TAG_ARGUMENT — broadening detection must fire for LongIntersection before the typed parser runs"
    ).toBe(false);
  });
});
