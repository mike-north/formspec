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

import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { buildFormSpecAnalysisFileSnapshot } from "../internal.js";
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
    const source = ["class Form {", "  /** @const not-json */", "  value!: number;", "}"].join(
      "\n"
    );

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
    // TRUE regression guard for PR #357's NoTruncation fix.
    //
    // The bug: hasExtensionBroadening called checker.typeToString(effectiveType) with
    // DEFAULT flags. TypeScript's default formatter truncates long inline type
    // representations by replacing trailing members with "{ ...; }". For anonymous
    // intersection types (no alias name), the default and NoTruncation outputs are
    // structurally different strings — so if tsTypeNames was registered with the full
    // NoTruncation representation, the name-match would FAIL and broadening detection
    // would silently miss, causing INVALID_TAG_ARGUMENT to fire on valid fields.
    //
    // The fix: use the file-local typeToString() helper which passes
    // TypeFormatFlags.NoTruncation, ensuring the rendered string matches the full
    // representation stored in tsTypeNames for any type complexity.
    //
    // Approach: compute the full NoTruncation string at test-setup time via the
    // TypeScript checker, then register THAT string in tsTypeNames. This makes the
    // test TS-version-independent while still verifying the truncation path fires.
    //
    // The inline intersection below has 10 members (a–j). Empirically, TypeScript
    // truncates members beyond ~7 with "{ ...; }" under default flags, producing
    // a shorter string that does NOT match the full NoTruncation representation.
    // This test FAILS without the NoTruncation fix because the default-flags string
    // would not match the registered tsTypeName.
    //
    // References: PR #357 review feedback; fix in
    // packages/analysis/src/file-snapshots.ts (hasExtensionBroadening)
    // The anonymous intersection source used for BOTH the probe (type-string extraction)
    // and the final snapshot run. It includes @minimum 0x10 so the typed parser fires
    // when broadening detection misses (pre-fix). Without the JSDoc comment, no tags
    // are processed and the test would pass trivially regardless of the fix.
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

    // Step 1: compute the NoTruncation string for the anonymous intersection type.
    const { checker: probeChecker, sourceFile: probeSf } = createProgram(
      anonymousIntersectionSource,
      "/virtual/probe-anonymous-intersection.ts"
    );

    // Walk to the property declaration to get its type.
    function findPropertyDeclaration(node: ts.Node): ts.PropertyDeclaration | undefined {
      if (ts.isPropertyDeclaration(node)) return node;
      return ts.forEachChild(node, findPropertyDeclaration);
    }
    const propDecl = findPropertyDeclaration(probeSf);
    if (propDecl === undefined) throw new Error("Expected property declaration in probe source");

    const fieldType = probeChecker.getTypeAtLocation(propDecl);
    const noTruncationName = probeChecker.typeToString(
      fieldType,
      undefined,
      ts.TypeFormatFlags.NoTruncation
    );
    const defaultFlagsName = probeChecker.typeToString(fieldType);

    // Sanity check: the default-flags string MUST differ from the NoTruncation string.
    // If TypeScript's internal threshold changes and they become equal, this test can
    // no longer demonstrate the truncation regression. We fail explicitly in that case.
    if (noTruncationName === defaultFlagsName) {
      throw new Error(
        "Truncation check setup failed: TypeScript's typeToString produced identical strings " +
          "in default-flags and NoTruncation mode for the anonymous intersection. " +
          "The truncation threshold may have changed. " +
          "NoTruncation length: " +
          String(noTruncationName.length) +
          ". Default: " +
          JSON.stringify(defaultFlagsName)
      );
    }

    // Step 2: register the FULL NoTruncation string in tsTypeNames. The pre-fix code
    // would compute defaultFlagsName (truncated) for the match — which would never
    // equal noTruncationName — and broadening detection would miss.
    const extension = defineExtension({
      extensionId: "x-test/anonymous-intersection-broadening",
      types: [
        defineCustomType({
          typeName: "AnonymousIntersection",
          // Register the full NoTruncation representation. Pre-fix code would compare
          // this against defaultFlagsName (truncated) — they differ, so match fails.
          // Post-fix code uses NoTruncation for both sides — they match.
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

    // Step 3: run the snapshot consumer on a field whose type is the anonymous intersection.
    const { checker, sourceFile } = createProgram(
      anonymousIntersectionSource,
      "/virtual/snapshot-canary-anonymous-intersection.ts"
    );

    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, {
      checker,
      extensionDefinitions: [extension],
    });

    // Post-fix: broadening detection fires (NoTruncation match succeeds) → typed
    // parser is bypassed → no INVALID_TAG_ARGUMENT for the hex argument "0x10".
    //
    // Pre-fix: broadening detection misses (default-flags string doesn't match the
    // registered noTruncationName) → typed parser fires → INVALID_TAG_ARGUMENT emitted.
    expect(
      snapshot.diagnostics.some((d) => d.code === "INVALID_TAG_ARGUMENT"),
      "Expected no INVALID_TAG_ARGUMENT — broadening detection must match the anonymous intersection " +
        "via NoTruncation. " +
        "NoTruncation name (" +
        String(noTruncationName.length) +
        " chars): " +
        noTruncationName.slice(0, 80) +
        "... " +
        "Default-flags name (" +
        String(defaultFlagsName.length) +
        " chars): " +
        defaultFlagsName.slice(0, 80) +
        "..."
    ).toBe(false);
  });
});
