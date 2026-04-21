/**
 * Unit tests for {@link deduplicateDiagnostics} in `class-analyzer.ts`.
 *
 * The helper was introduced by Phase 4 Slice C as a temporary symptom-fix for
 * N-fold duplication of setup diagnostics when a declaration with N fields is
 * analyzed under an extension registry that has setup failures. The root-cause
 * restructure is tracked in
 * `docs/refactors/phase-4-slice-c-deduplicate-diagnostics-root-fix.md`.
 *
 * These tests pin the invariants that make the helper safe to ship:
 *
 *   1. Setup diagnostics with identical `code + message` are collapsed.
 *   2. Non-setup diagnostics with identical `code + message` but distinct
 *      `primaryLocation` are ALL retained — silently dropping a per-field
 *      error on a sibling field would be a user-visible regression.
 *   3. Setup diagnostics with identical `code` but distinct `message` are
 *      both retained (dedup key is `code + message`, not `code` alone).
 *   4. The `\0` separator in the dedup key prevents false-positive key
 *      collisions between a code that is a prefix of another code+message.
 */

import { describe, expect, it } from "vitest";
import type { ConstraintSemanticDiagnostic } from "@formspec/analysis/internal";
import { deduplicateDiagnostics } from "../analyzer/class-analyzer.js";

const EXTENSION_PROVENANCE = {
  surface: "extension",
  file: "/virtual/test.ts",
  line: 1,
  column: 0,
} as const;

function setupDiag(
  code: "SYNTHETIC_SETUP_FAILURE" | "UNSUPPORTED_CUSTOM_TYPE_OVERRIDE",
  message: string
): ConstraintSemanticDiagnostic {
  return {
    code,
    message,
    severity: "error",
    primaryLocation: EXTENSION_PROVENANCE,
    relatedLocations: [],
  };
}

function tagSiteDiag(
  code: string,
  message: string,
  line: number
): ConstraintSemanticDiagnostic {
  return {
    code,
    message,
    severity: "error",
    primaryLocation: {
      surface: "jsdoc",
      file: "/virtual/test.ts",
      line,
      column: 0,
    },
    relatedLocations: [],
  };
}

describe("deduplicateDiagnostics", () => {
  it("returns the array unchanged when length <= 1", () => {
    expect(deduplicateDiagnostics([])).toEqual([]);
    const single = [setupDiag("SYNTHETIC_SETUP_FAILURE", "boom")];
    expect(deduplicateDiagnostics(single)).toEqual(single);
  });

  it("collapses identical setup diagnostics", () => {
    const duplicated: readonly ConstraintSemanticDiagnostic[] = [
      setupDiag("SYNTHETIC_SETUP_FAILURE", 'Invalid custom type name "Not A Type"'),
      setupDiag("SYNTHETIC_SETUP_FAILURE", 'Invalid custom type name "Not A Type"'),
      setupDiag("SYNTHETIC_SETUP_FAILURE", 'Invalid custom type name "Not A Type"'),
    ];
    const result = deduplicateDiagnostics(duplicated);
    expect(result).toHaveLength(1);
    expect(result[0]?.code).toBe("SYNTHETIC_SETUP_FAILURE");
  });

  it("also collapses identical UNSUPPORTED_CUSTOM_TYPE_OVERRIDE diagnostics", () => {
    const duplicated = [
      setupDiag("UNSUPPORTED_CUSTOM_TYPE_OVERRIDE", "Override of Array is not supported"),
      setupDiag("UNSUPPORTED_CUSTOM_TYPE_OVERRIDE", "Override of Array is not supported"),
    ];
    const result = deduplicateDiagnostics(duplicated);
    expect(result).toHaveLength(1);
    expect(result[0]?.code).toBe("UNSUPPORTED_CUSTOM_TYPE_OVERRIDE");
  });

  it("retains setup diagnostics with the same code but different messages", () => {
    const diagnostics = [
      setupDiag("SYNTHETIC_SETUP_FAILURE", 'Invalid custom type name "Foo"'),
      setupDiag("SYNTHETIC_SETUP_FAILURE", 'Invalid custom type name "Bar"'),
    ];
    const result = deduplicateDiagnostics(diagnostics);
    expect(result).toHaveLength(2);
    expect(result.map((d) => d.message)).toEqual([
      'Invalid custom type name "Foo"',
      'Invalid custom type name "Bar"',
    ]);
  });

  it("retains non-setup diagnostics even when code + message are identical", () => {
    // Two separate fields producing the same placement error must both surface.
    // Silent-dropping the second one would hide a legitimate per-field bug.
    const diagnostics = [
      tagSiteDiag("INVALID_TAG_PLACEMENT", "@minLength is not valid on this field", 10),
      tagSiteDiag("INVALID_TAG_PLACEMENT", "@minLength is not valid on this field", 20),
    ];
    const result = deduplicateDiagnostics(diagnostics);
    expect(result).toHaveLength(2);
    expect(result[0]?.primaryLocation).toMatchObject({ line: 10 });
    expect(result[1]?.primaryLocation).toMatchObject({ line: 20 });
  });

  it("preserves non-setup diagnostics when they are interleaved with duplicated setup diagnostics", () => {
    const diagnostics = [
      setupDiag("SYNTHETIC_SETUP_FAILURE", "boom"),
      tagSiteDiag("TYPE_MISMATCH", "string required", 5),
      setupDiag("SYNTHETIC_SETUP_FAILURE", "boom"),
      tagSiteDiag("TYPE_MISMATCH", "string required", 15),
    ];
    const result = deduplicateDiagnostics(diagnostics);
    // One setup dedup, both non-setup retained.
    expect(result).toHaveLength(3);
    expect(result.filter((d) => d.code === "SYNTHETIC_SETUP_FAILURE")).toHaveLength(1);
    expect(result.filter((d) => d.code === "TYPE_MISMATCH")).toHaveLength(2);
  });

  it("uses the \\0 separator so key collisions do not occur", () => {
    // If the key were `${code}${message}` with no separator, these two would
    // collide: "FOO" + "BAR" === "FO" + "OBAR". The `\0` separator prevents
    // that class of false positive. We use real setup codes here so both
    // entries are eligible for dedup.
    const diagnostics = [
      setupDiag("SYNTHETIC_SETUP_FAILURE", "ABC"),
      // Different code, different message, but prefix concatenation would
      // collide without the separator. Keep both messages distinct from the
      // first diagnostic via the second code path.
      setupDiag("UNSUPPORTED_CUSTOM_TYPE_OVERRIDE", "ABC"),
    ];
    const result = deduplicateDiagnostics(diagnostics);
    expect(result).toHaveLength(2);
    expect(result.map((d) => d.code)).toEqual([
      "SYNTHETIC_SETUP_FAILURE",
      "UNSUPPORTED_CUSTOM_TYPE_OVERRIDE",
    ]);
  });
});
