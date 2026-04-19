/**
 * The parity-divergence pinned tests have been moved to packages/build.
 *
 * Reason: the build-side probe must call `generateSchemas` (from `@formspec/build`)
 * to route through the REAL build lowering pipeline
 * (`parseTSDocTags` → `buildCompilerBackedConstraintDiagnostics` →
 * `renderSyntheticArgumentExpression`). `@formspec/analysis` has no dependency
 * on `@formspec/build`, so the tests cannot live here without creating a
 * circular dependency.
 *
 * @see packages/build/src/__tests__/parity-divergences.test.ts — current home
 * @see docs/refactors/synthetic-checker-retirement.md §3 — divergence table
 */

// Vitest requires at least one test or describe block in a test file.
// This placeholder satisfies that requirement while the real tests live in
// packages/build where the full build pipeline is accessible.
import { describe } from "vitest";

describe.skip("parity-divergences (moved to packages/build)", () => {
  // All tests have been moved to packages/build/src/__tests__/parity-divergences.test.ts.
  // See module-level JSDoc for the reason.
});
