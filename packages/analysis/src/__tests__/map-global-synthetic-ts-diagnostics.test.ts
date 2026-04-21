/**
 * Unit tests for `_mapGlobalSyntheticTsDiagnostics` in `file-snapshots.ts`.
 *
 * Regression coverage for post-merge review feedback on PR #384: the Phase 4
 * Slice C refactor unintentionally dropped the emission of TS-kind global
 * diagnostics from the synthetic batch check — any TypeScript diagnostic in
 * `batchCheck.globalDiagnostics` (no file/start info or outside every tag
 * application's line range) used to surface as `TYPE_MISMATCH` and disappeared
 * from snapshots after the relocation.
 *
 * The helper:
 *   1. Passes through `kind: "typescript"` globals as `TYPE_MISMATCH`
 *      diagnostics anchored at the supplied span.
 *   2. Drops setup-kind globals (`synthetic-setup`,
 *      `unsupported-custom-type-override`), which the snapshot entry path
 *      pre-emits at the file-level span via `_validateExtensionSetup`.
 *   3. Threads `typescriptDiagnosticCode` into `data` only when the diagnostic
 *      code is positive (negative/zero codes come from synthetic wrapper
 *      paths and are not real TS codes).
 */

import { describe, expect, it } from "vitest";
import type { SyntheticCompilerDiagnostic } from "../compiler-signatures.js";
import { _mapGlobalSyntheticTsDiagnostics } from "../file-snapshots.js";

const ANCHOR_SPAN = { start: 10, end: 42 };

function tsGlobal(message: string, code = 2322): SyntheticCompilerDiagnostic {
  return { kind: "typescript", code, message };
}

function setupGlobal(
  kind: "synthetic-setup" | "unsupported-custom-type-override",
  message: string
): SyntheticCompilerDiagnostic {
  return { kind, code: -1, message };
}

describe("_mapGlobalSyntheticTsDiagnostics", () => {
  it("maps every kind: 'typescript' diagnostic to a TYPE_MISMATCH analysis diagnostic", () => {
    const globals = [tsGlobal("Type 'string' is not assignable to type 'number'.")];
    const result = _mapGlobalSyntheticTsDiagnostics(globals, ANCHOR_SPAN, {});
    expect(result).toHaveLength(1);
    expect(result[0]?.code).toBe("TYPE_MISMATCH");
    expect(result[0]?.message).toBe(
      "Type 'string' is not assignable to type 'number'."
    );
    expect(result[0]?.range).toEqual(ANCHOR_SPAN);
  });

  it("drops setup-kind globals (pre-emitted at file level by the snapshot entry path)", () => {
    const globals = [
      setupGlobal("synthetic-setup", 'Invalid custom type name "Not A Type"'),
      setupGlobal("unsupported-custom-type-override", "Override of Array is not supported"),
    ];
    const result = _mapGlobalSyntheticTsDiagnostics(globals, ANCHOR_SPAN, {});
    expect(result).toHaveLength(0);
  });

  it("preserves TS-kind emissions while dropping interleaved setup-kind globals", () => {
    const globals = [
      setupGlobal("synthetic-setup", "first"),
      tsGlobal("real TS error", 2345),
      setupGlobal("unsupported-custom-type-override", "second"),
      tsGlobal("another TS error"),
    ];
    const result = _mapGlobalSyntheticTsDiagnostics(globals, ANCHOR_SPAN, {});
    expect(result).toHaveLength(2);
    expect(result.map((d) => d.message)).toEqual([
      "real TS error",
      "another TS error",
    ]);
    expect(result.every((d) => d.code === "TYPE_MISMATCH")).toBe(true);
  });

  it("threads typescriptDiagnosticCode into data only when code > 0", () => {
    const globals = [
      tsGlobal("has real code", 2345),
      tsGlobal("has zero code", 0),
      tsGlobal("has negative code", -1),
    ];
    const result = _mapGlobalSyntheticTsDiagnostics(globals, ANCHOR_SPAN, {
      placement: "class-field",
    });
    expect(result).toHaveLength(3);
    expect(result[0]?.data).toMatchObject({
      placement: "class-field",
      typescriptDiagnosticCode: 2345,
    });
    expect(result[1]?.data).toEqual({ placement: "class-field" });
    expect(result[2]?.data).toEqual({ placement: "class-field" });
  });

  it("merges caller-provided data (placement, tagNames) with the TS-code field", () => {
    const globals = [tsGlobal("error", 2322)];
    const result = _mapGlobalSyntheticTsDiagnostics(globals, ANCHOR_SPAN, {
      placement: "type-alias",
      tagNames: ["@minimum", "@maximum"],
    });
    expect(result[0]?.data).toEqual({
      placement: "type-alias",
      tagNames: ["@minimum", "@maximum"],
      typescriptDiagnosticCode: 2322,
    });
  });

  it("returns an empty array when given an empty globals list", () => {
    expect(_mapGlobalSyntheticTsDiagnostics([], ANCHOR_SPAN, {})).toEqual([]);
  });
});
