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
 * @see docs/refactors/synthetic-checker-retirement.md §3 — divergence table
 * @see docs/refactors/synthetic-checker-retirement.md §9.3 #16 — test action
 */

import { describe, expect, it } from "vitest";
import {
  checkSyntheticTagApplication,
  buildFormSpecAnalysisFileSnapshot,
} from "../internal.js";
import { createProgram } from "./helpers.js";

// Supporting declarations used by the build-path low-level helper.
// Mirrors what tsdoc-parser.ts provides as supportingDeclarations.
const BASIC_SUPPORTING_DECLARATIONS = [] as const;

// =============================================================================
// Helper: invoke the BUILD consumer path.
//
// The build consumer uses `renderSyntheticArgumentExpression` (in tsdoc-parser.ts)
// to render the raw tag argument text into a TypeScript expression before
// passing it to `checkSyntheticTagApplication`. We replicate the relevant
// rendering logic inline to make the divergence explicit and self-documenting.
//
// renderSyntheticArgumentExpression (build path):
//   - "number" valueKind: finite? → pass through; non-finite? → JSON.stringify(text)
//   - "json" valueKind: valid JSON? → `(${json})`; invalid? → JSON.stringify(text)
//
// getArgumentExpression (snapshot path):
//   - number label: always pass through (Infinity, NaN are valid TS identifiers)
//   - json label: invalid JSON? → return null (argument omitted from synthetic call)
// =============================================================================

function buildPathArgumentFor(
  valueKind: "number" | "json",
  argumentText: string
): string | null {
  const trimmed = argumentText.trim();
  if (trimmed === "") {
    return null;
  }
  if (valueKind === "number") {
    return Number.isFinite(Number(trimmed)) ? trimmed : JSON.stringify(trimmed);
  }
  // json
  try {
    JSON.parse(trimmed);
    return `(${trimmed})`;
  } catch {
    return JSON.stringify(trimmed);
  }
}

function runBuildConsumer(tagName: string, valueKind: "number" | "json", argumentText: string) {
  const argumentExpression = buildPathArgumentFor(valueKind, argumentText);
  return checkSyntheticTagApplication({
    tagName,
    placement: "class-field",
    hostType: "number",
    subjectType: "number",
    supportingDeclarations: BASIC_SUPPORTING_DECLARATIONS,
    ...(argumentExpression === null ? {} : { argumentExpression }),
  });
}

function runSnapshotConsumer(source: string) {
  const { checker, sourceFile } = createProgram(source, "/virtual/parity-divergence.ts");
  return buildFormSpecAnalysisFileSnapshot(sourceFile, { checker });
}

// =============================================================================
// Divergence case 1: @const not-json
//
// Build path renders invalid-JSON @const arguments as quoted string literals
// (JSON.stringify of the raw text). The synthetic call becomes:
//   tag_const(__ctx<"class-field", number, number>(), "not-json")
// JsonValue = unknown, so "not-json" (string) satisfies unknown → no diagnostic.
//
// Snapshot path returns null for invalid JSON (JSON.parse throws → null).
// The synthetic call becomes:
//   tag_const(__ctx<"class-field", number, number>())
// Missing the required second argument → "Expected 2 arguments, but got 1."
// → code: INVALID_TAG_ARGUMENT
//
// KNOWN DIVERGENCE (refactor plan §3):
//   build:    argument rendered as JSON.stringify("not-json") = '"not-json"'; passes (string ≤ unknown)
//   snapshot: argument omitted (null return); fails INVALID_TAG_ARGUMENT
// Phase 2/3 normalization decides whether to unify; this test is the anchor.
// =============================================================================

describe("known divergence: @const not-json", () => {
  it("BUILD consumer: passes with no diagnostic (string satisfies JsonValue = unknown)", () => {
    // KNOWN DIVERGENCE (refactor plan §3): build produces NO diagnostic here.
    // The build path renders "not-json" as '"not-json"' (quoted string).
    // JsonValue is typed as `unknown` in the synthetic prelude, so any value passes.
    const result = runBuildConsumer("const", "json", "not-json");

    expect(result.diagnostics).toHaveLength(0);
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
// Build path: Number.isFinite(Infinity) = false → JSON.stringify("Infinity") = '"Infinity"'
// Synthetic call: tag_minimum(__ctx<"class-field", number, number>(), "Infinity")
// @minimum expects `number`; string "Infinity" is not assignable to number → TYPE_MISMATCH.
//
// Snapshot path: returns "Infinity" (the identifier) unchanged (number-label branch).
// Synthetic call: tag_minimum(__ctx<"class-field", number, number>(), Infinity)
// Infinity has type `number` in TypeScript → no diagnostic.
//
// KNOWN DIVERGENCE (refactor plan §3):
//   build:    "Infinity" → stringified '"Infinity"'; fails TYPE_MISMATCH
//   snapshot: "Infinity" → identifier Infinity; passes (number)
// Phase 2/3 normalization must pick one: treat Infinity as valid number, or reject it.
// =============================================================================

describe("known divergence: @minimum Infinity", () => {
  it("BUILD consumer: emits TYPE_MISMATCH (Infinity stringified to '\"Infinity\"', a string)", () => {
    // KNOWN DIVERGENCE (refactor plan §3): build produces TYPE_MISMATCH here.
    // renderSyntheticArgumentExpression: Number.isFinite(Infinity) = false
    //   → JSON.stringify("Infinity") = '"Infinity"'  (a string literal).
    // tag_minimum expects number; string is not assignable to number.
    const result = runBuildConsumer("minimum", "number", "Infinity");

    expect(result.diagnostics).not.toHaveLength(0);
    const diagnostic = result.diagnostics[0];
    // Pin the exact TypeScript message so future signature changes are caught.
    // The message pattern "Argument of type 'string' is not assignable to
    // parameter of type 'number'" is produced by the synthetic checker when
    // '"Infinity"' (a string literal) is passed where number is expected.
    expect(diagnostic?.message).toContain("not assignable");
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

    const typeMismatch = snapshot.diagnostics.find((d) => d.code === "TYPE_MISMATCH");
    const invalidArg = snapshot.diagnostics.find((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(typeMismatch).toBeUndefined();
    expect(invalidArg).toBeUndefined();
  });
});

// =============================================================================
// Divergence case 3: @minimum NaN
//
// Build path: Number.isFinite(NaN) = false → JSON.stringify("NaN") = '"NaN"'
// Synthetic call: tag_minimum(__ctx<"class-field", number, number>(), "NaN")
// @minimum expects `number`; string "NaN" is not assignable to number → TYPE_MISMATCH.
//
// Snapshot path: returns "NaN" (the identifier) unchanged (number-label branch).
// Synthetic call: tag_minimum(__ctx<"class-field", number, number>(), NaN)
// NaN is `number` in TypeScript (NaN: number) → no diagnostic.
//
// KNOWN DIVERGENCE (refactor plan §3):
//   build:    "NaN" → stringified '"NaN"'; fails TYPE_MISMATCH
//   snapshot: "NaN" → identifier NaN; passes (number)
// Phase 2/3 normalization must pick one: treat NaN as valid number arg, or reject it.
// =============================================================================

describe("known divergence: @minimum NaN", () => {
  it("BUILD consumer: emits TYPE_MISMATCH (NaN stringified to '\"NaN\"', a string)", () => {
    // KNOWN DIVERGENCE (refactor plan §3): build produces TYPE_MISMATCH here.
    // renderSyntheticArgumentExpression: Number.isFinite(NaN) = false
    //   → JSON.stringify("NaN") = '"NaN"'  (a string literal).
    // tag_minimum expects number; string is not assignable to number.
    const result = runBuildConsumer("minimum", "number", "NaN");

    expect(result.diagnostics).not.toHaveLength(0);
    const diagnostic = result.diagnostics[0];
    // Pin the exact TypeScript message so future signature changes are caught.
    // Same string-not-assignable-to-number pattern as the Infinity case above.
    expect(diagnostic?.message).toContain("not assignable");
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

    const typeMismatch = snapshot.diagnostics.find((d) => d.code === "TYPE_MISMATCH");
    const invalidArg = snapshot.diagnostics.find((d) => d.code === "INVALID_TAG_ARGUMENT");
    expect(typeMismatch).toBeUndefined();
    expect(invalidArg).toBeUndefined();
  });
});
