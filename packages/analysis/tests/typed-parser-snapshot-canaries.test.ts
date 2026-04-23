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
 *   packages/build/tests/typed-parser-canaries.test.ts
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
 * @see packages/build/tests/typed-parser-canaries.test.ts (build-consumer mirror)
 */

import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { buildFormSpecAnalysisFileSnapshot } from "../src/internal.js";
import { defineCustomType, defineExtension } from "@formspec/core";
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

  const { checker, sourceFile } = createProgram(source, `/virtual/snapshot-canary-${label}.ts`);
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
    //
    // Note: field type is "a" | "b" (string literal union) so Role B passes
    // (enum-member-addressable capability) and Role C runs.
    const diagnostics = snapshotDiagnosticsFor("enumOptions", "5", '"a" | "b"', "scalar");
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
    //
    // Note: field type is "a" | "b" (string literal union) so Role B passes
    // (enum-member-addressable capability) and Role C runs.
    const diagnostics = snapshotDiagnosticsFor("enumOptions", "{}", '"a" | "b"', "object");
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
  it("rejects @const not-json on number via @const IR validation (Phase 5B: TYPE_MISMATCH)", () => {
    // parseTagArgument("const", "not-json", "snapshot") → ok: true, { kind: "raw-string-fallback" }
    // The typed parser deliberately accepts invalid-JSON @const with a raw-string fallback
    // whose value is the raw string literal ("not-json").
    //
    // Phase 5B (2026-04-21): the snapshot consumer now runs @const IR validation
    // (_checkConstValueAgainstType) after Role-C accepts the parsed value. The
    // raw-string-fallback value is a string ("not-json"), which does NOT match
    // the number field's primitive kind → TYPE_MISMATCH is emitted before the
    // synthetic checker runs.
    //
    // This closes the previous divergence tracked in parity-harness.test.ts §3:
    //   - Snapshot: (pre-5B) INVALID_TAG_ARGUMENT from synthetic arity check.
    //   - Snapshot: (post-5B) TYPE_MISMATCH from @const IR check — matches build path.
    //   - Build:    TYPE_MISMATCH from IR validator (string-vs-number).
    //
    // @see packages/analysis/src/constraint-applicability.ts _checkConstValueAgainstType
    // @see docs/refactors/synthetic-checker-retirement.md §4 Phase 5B
    const source = ["class Form {", "  /** @const not-json */", "  value!: number;", "}"].join(
      "\n"
    );

    const { checker, sourceFile } = createProgram(
      source,
      "/virtual/snapshot-canary-const-not-json.ts"
    );
    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });
    const diagnostics = snapshot.diagnostics;

    // @const IR check fires after Role-C pass: raw-string value "not-json"
    // (string) does not match the number primitive kind → TYPE_MISMATCH with
    // the shared "@const value type ..." message.
    const irMismatchDiag = diagnostics.find(
      (d) =>
        d.code === "TYPE_MISMATCH" &&
        typeof d.message === "string" &&
        d.message.includes("@const value type") &&
        d.message.includes("is incompatible with field type")
    );
    expect(
      irMismatchDiag,
      "Expected TYPE_MISMATCH from the @const IR check (snapshot consumer Phase 5B)"
    ).toBeDefined();

    // Confirm: no synthetic arity error — the @const IR check runs before the
    // synthetic batch, so the `continue` above skips the synthetic call entirely.
    expect(
      diagnostics.some(
        (d) =>
          d.code === "INVALID_TAG_ARGUMENT" &&
          typeof d.message === "string" &&
          d.message.startsWith("Expected") &&
          d.message.includes("arguments")
      ),
      "Expected no synthetic arity error — @const IR check short-circuits the synthetic call"
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

  it("detects broadening for a named-alias intersection type registered by alias name (named-alias sub-path of NoTruncation fix)", () => {
    // Sub-path guard for the fix that replaced checker.typeToString(effectiveType)
    // with typeToString(effectiveType, checker) (passing TypeFormatFlags.NoTruncation).
    //
    // Named type aliases: TypeScript's typeToString returns the alias name ("LongIntersection")
    // in BOTH default-flag mode AND NoTruncation mode. This test confirms the fix does not
    // break the named-alias path — it is NOT a demonstration of the truncation bug itself.
    //
    // The real truncation scenario (anonymous/expanded types) is exercised in the
    // companion test below: "detects broadening for an anonymous intersection ...".
    const extension = defineExtension({
      extensionId: "x-test/complex-type-broadening",
      types: [
        defineCustomType({
          typeName: "LongIntersection",
          // Register the alias name — TypeScript's typeToString returns the alias name
          // for named type aliases regardless of truncation flags, so this path is stable.
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

    expect(
      snapshot.diagnostics.some((d) => d.code === "INVALID_TAG_ARGUMENT"),
      "Expected no INVALID_TAG_ARGUMENT — broadening detection must fire for LongIntersection before the typed parser runs"
    ).toBe(false);
  });

  it("detects broadening for an anonymous intersection type whose NoTruncation string differs from the default-flags string (regression: PR #357 review)", () => {
    // TRUE regression guard for PR #357's NoTruncation fix in hasExtensionBroadening.
    //
    // The bug: the pre-fix call `checker.typeToString(effectiveType)` used default
    // flags, which truncate long anonymous types by replacing trailing members with
    // "{ ...; }". When an extension registers the FULL NoTruncation string in
    // tsTypeNames, the truncated default-flags string never matches — broadening
    // detection silently misses and INVALID_TAG_ARGUMENT fires on valid fields.
    //
    // Approach: compute the full NoTruncation string at test-setup time, register
    // that exact string in tsTypeNames, and assert no INVALID_TAG_ARGUMENT fires.
    // This keeps the test TS-version-independent; the probe below asserts that the
    // two renderings actually differ, so the test fails loudly rather than silently
    // degrading if TypeScript's truncation heuristic changes.
    //
    // The 10-member intersection (a–j) comfortably exceeds TypeScript's default
    // truncation threshold (empirically ~7 members as of TS 5.x).
    const anonymousIntersectionSource = [
      "class TestForm {",
      "  /** @minimum 0x10 */",
      "  value!: string",
      "    & { readonly a: boolean } & { readonly b: boolean }",
      "    & { readonly c: boolean } & { readonly d: boolean }",
      "    & { readonly e: boolean } & { readonly f: boolean }",
      "    & { readonly g: boolean } & { readonly h: boolean }",
      "    & { readonly i: boolean } & { readonly j: boolean };",
      "}",
    ].join("\n");

    const { checker, sourceFile } = createProgram(
      anonymousIntersectionSource,
      "/virtual/snapshot-canary-anonymous-intersection.ts"
    );

    const classDecl = sourceFile.statements.find(ts.isClassDeclaration);
    const propDecl = classDecl?.members.find(ts.isPropertyDeclaration);
    if (propDecl === undefined) throw new Error("Expected property declaration in fixture source");

    const fieldType = checker.getTypeAtLocation(propDecl);
    const noTruncationName = checker.typeToString(
      fieldType,
      undefined,
      ts.TypeFormatFlags.NoTruncation
    );
    const defaultFlagsName = checker.typeToString(fieldType);

    // Precondition: the two renderings must differ for this test to demonstrate
    // the truncation bug. If TypeScript's threshold ever changes so they match,
    // this assertion fails loudly rather than the test silently degenerating.
    expect(
      noTruncationName,
      "TypeScript's truncation heuristic may have changed — anonymous intersection renders identically with and without NoTruncation; fixture needs more members"
    ).not.toEqual(defaultFlagsName);

    // Register the FULL NoTruncation string. Pre-fix code compared this against
    // the truncated default-flags string — no match, broadening missed. Post-fix
    // code renders both sides with NoTruncation — match succeeds.
    const extension = defineExtension({
      extensionId: "x-test/anonymous-intersection-broadening",
      types: [
        defineCustomType({
          typeName: "AnonymousIntersection",
          tsTypeNames: [noTruncationName],
          builtinConstraintBroadenings: [
            {
              tagName: "minimum",
              constraintName: "AnonymousIntersectionMinimum",
              parseValue: (raw) => Number(raw),
            },
          ],
          toJsonSchema: (_payload, _prefix) => ({ type: "object" }),
        }),
      ],
    });

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, {
      checker,
      extensionDefinitions: [extension],
    });

    expect(
      snapshot.diagnostics.some((d) => d.code === "INVALID_TAG_ARGUMENT"),
      "Expected no INVALID_TAG_ARGUMENT — broadening detection must match the anonymous intersection via NoTruncation (regression in hasExtensionBroadening)"
    ).toBe(false);
  });
});
