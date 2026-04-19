/**
 * Pins the current setup-diagnostic emission-count model (§9.3 #19).
 *
 * Phase 4 of the synthetic-checker retirement plan proposes relocating
 * UNSUPPORTED_CUSTOM_TYPE_OVERRIDE and SYNTHETIC_SETUP_FAILURE from the
 * per-batch `runBatchSyntheticCheck` call site into an extension-registry
 * construction pass. Before that relocation the test below pins the *current*
 * behavior so a regression is immediately visible: if Phase 4 changes when
 * and how many times setup diagnostics are emitted, these tests will fail and
 * the delta must be explicitly signed off.
 *
 * Current emission model: PER-BATCH / PER-CALL
 *   - One `UNSUPPORTED_CUSTOM_TYPE_OVERRIDE` diagnostic is produced each time
 *     `buildFormSpecAnalysisFileSnapshot` is called with an extension that
 *     attempts to override a TypeScript built-in type ("Array").
 *   - The setup failure occurs during synthetic-prelude construction, which
 *     throws before the LRU cache key can be computed. Therefore the cache is
 *     bypassed entirely for setup failures — each call re-triggers the throw
 *     and emits a fresh diagnostic regardless of whether the extension config
 *     object is the same reference or a newly-constructed one.
 *   - Consequence: N snapshot refreshes → N diagnostics; re-creating the
 *     "registry" (constructing a new extension config object and running again)
 *     produces the same count-per-call as using the original config.
 *
 * If Phase 4 deduplicates by moving validation into a registry object:
 *   - The per-call count might drop to 0 (if validation only runs at registry
 *     construction time) — test step 3 would fail.
 *   - Or the delta for re-construction would increase (e.g. +3 instead of +1
 *     if the diagnostic is emitted per-field again) — test step 5 would fail.
 *
 * @see docs/refactors/synthetic-checker-retirement.md §9.3 #19
 * @see packages/analysis/src/compiler-signatures.ts (runBatchSyntheticCheck)
 * @see packages/analysis/src/__tests__/compiler-signatures.test.ts lines 404-431
 */

import { describe, expect, it } from "vitest";
import { buildFormSpecAnalysisFileSnapshot } from "../internal.js";
import { createProgram } from "./helpers.js";

/**
 * A TypeScript source file that contains exactly one FormSpec comment block
 * with constraint tags. The source is deliberately minimal: one interface with
 * one commented field. This means each `buildFormSpecAnalysisFileSnapshot`
 * call runs exactly one synthetic batch containing exactly one application,
 * so every setup failure produces exactly one global diagnostic per call.
 */
const SOURCE_WITH_ONE_COMMENT_BLOCK = `
  interface Foo {
    /**
     * @minLength 1
     * @maxLength 10
     */
    label: string;
  }
`;

/**
 * Extension config that registers "Array" as a custom type name. "Array" is an
 * unsupported TypeScript global built-in type override — attempting to declare
 * it triggers an UNSUPPORTED_CUSTOM_TYPE_OVERRIDE setup failure during
 * synthetic-prelude construction. This is the same fixture used by
 * file-snapshots.test.ts:137-172 and compiler-signatures.test.ts:361-458.
 */
const ARRAY_OVERRIDE_EXTENSION = [
  {
    extensionId: "x-example/array",
    customTypes: [{ tsTypeNames: ["Array"] }],
  },
] as const;

function countSetupDiagnostics(
  snapshots: ReturnType<typeof buildFormSpecAnalysisFileSnapshot>[],
  code: string
): number {
  return snapshots.reduce(
    (acc, snapshot) =>
      acc + snapshot.diagnostics.filter((d) => d.code === code).length,
    0
  );
}

describe("setup-diagnostic emission-count stability (§9.3 #19)", () => {
  it("emits exactly one UNSUPPORTED_CUSTOM_TYPE_OVERRIDE per snapshot-refresh call", () => {
    const { checker, sourceFile } = createProgram(
      SOURCE_WITH_ONE_COMMENT_BLOCK,
      "/virtual/emission-count-single.ts"
    );

    // A single call must produce exactly one diagnostic.
    const snapshot = buildFormSpecAnalysisFileSnapshot(sourceFile, {
      checker,
      extensions: [...ARRAY_OVERRIDE_EXTENSION],
    });

    expect(
      snapshot.diagnostics.filter((d) => d.code === "UNSUPPORTED_CUSTOM_TYPE_OVERRIDE")
    ).toHaveLength(1);
  });

  it("accumulates one diagnostic per call across three repeated snapshot refreshes (per-batch model)", () => {
    const { checker, sourceFile } = createProgram(
      SOURCE_WITH_ONE_COMMENT_BLOCK,
      "/virtual/emission-count-repeat.ts"
    );

    // Simulate three IDE snapshot refreshes on the same file with the same
    // extension config. In the current per-batch model each call independently
    // invokes buildSyntheticHelperPrelude, which throws for "Array", bypassing
    // the LRU cache and producing a fresh diagnostic.
    //
    // Current emission model: per-batch / per-call — one diagnostic per call.
    // If this changes to per-registry (emitting only once per registry
    // construction), the total would be 1 rather than 3, and this assertion
    // would fail — which is the signal Phase 4 must explicitly handle.
    const extensions = [...ARRAY_OVERRIDE_EXTENSION];
    const snapshots = [
      buildFormSpecAnalysisFileSnapshot(sourceFile, { checker, extensions }),
      buildFormSpecAnalysisFileSnapshot(sourceFile, { checker, extensions }),
      buildFormSpecAnalysisFileSnapshot(sourceFile, { checker, extensions }),
    ];

    // Each call produces exactly one diagnostic; three calls total = 3.
    for (const snapshot of snapshots) {
      expect(
        snapshot.diagnostics.filter((d) => d.code === "UNSUPPORTED_CUSTOM_TYPE_OVERRIDE")
      ).toHaveLength(1);
    }

    expect(countSetupDiagnostics(snapshots, "UNSUPPORTED_CUSTOM_TYPE_OVERRIDE")).toBe(3);
  });

  it("produces the same per-call count when the extension config object is freshly constructed (no dedup across 'registries')", () => {
    const { checker, sourceFile } = createProgram(
      SOURCE_WITH_ONE_COMMENT_BLOCK,
      "/virtual/emission-count-fresh-registry.ts"
    );

    // Simulate three refreshes using the original extension config.
    const originalExtensions = [...ARRAY_OVERRIDE_EXTENSION];
    const firstThreeSnapshots = [
      buildFormSpecAnalysisFileSnapshot(sourceFile, { checker, extensions: originalExtensions }),
      buildFormSpecAnalysisFileSnapshot(sourceFile, { checker, extensions: originalExtensions }),
      buildFormSpecAnalysisFileSnapshot(sourceFile, { checker, extensions: originalExtensions }),
    ];
    const countAfterThree = countSetupDiagnostics(
      firstThreeSnapshots,
      "UNSUPPORTED_CUSTOM_TYPE_OVERRIDE"
    );
    expect(countAfterThree).toBe(3);

    // "Recreate the registry": construct a fresh extension config object with
    // identical values and run one additional snapshot refresh. In the current
    // model this is semantically identical to the previous calls — the setup
    // failure path bypasses the LRU cache, so there is no deduplication across
    // "registry" lifetimes.
    //
    // Expected delta: +1 (same per-call cost regardless of config object identity).
    // If Phase 4 moves validation into registry construction and deduplicates
    // at that level, the delta might be 0 (diagnostic consumed at construction,
    // not at refresh time) — which is the behavior change to sign off on.
    const freshExtensions = [
      {
        extensionId: "x-example/array",
        customTypes: [{ tsTypeNames: ["Array"] }],
      },
    ];
    const snapshotWithFreshRegistry = buildFormSpecAnalysisFileSnapshot(sourceFile, {
      checker,
      extensions: freshExtensions,
    });

    expect(
      snapshotWithFreshRegistry.diagnostics.filter(
        (d) => d.code === "UNSUPPORTED_CUSTOM_TYPE_OVERRIDE"
      )
    ).toHaveLength(1);

    const totalCount = countSetupDiagnostics(
      [...firstThreeSnapshots, snapshotWithFreshRegistry],
      "UNSUPPORTED_CUSTOM_TYPE_OVERRIDE"
    );
    // Delta from re-creating the extension config: +1 (per-batch, not per-registry).
    expect(totalCount).toBe(4);
  });

  it("pins the same per-batch emission model for SYNTHETIC_SETUP_FAILURE (invalid type name)", () => {
    // SYNTHETIC_SETUP_FAILURE uses the same code-path as
    // UNSUPPORTED_CUSTOM_TYPE_OVERRIDE: both throw from
    // collectExtensionCustomTypeNames before the LRU cache key is built.
    // Pin this separately so Phase 4 cannot forget the second setup-error kind.
    //
    // Current emission model: per-batch / per-call — one diagnostic per call.
    const invalidTypeExtension = [
      {
        extensionId: "x-example/invalid-type",
        customTypes: [{ tsTypeNames: ["Not A Type"] }],
      },
    ];

    const { checker, sourceFile } = createProgram(
      SOURCE_WITH_ONE_COMMENT_BLOCK,
      "/virtual/emission-count-synthetic-setup.ts"
    );

    const snapshots = [
      buildFormSpecAnalysisFileSnapshot(sourceFile, { checker, extensions: invalidTypeExtension }),
      buildFormSpecAnalysisFileSnapshot(sourceFile, { checker, extensions: invalidTypeExtension }),
      buildFormSpecAnalysisFileSnapshot(sourceFile, { checker, extensions: invalidTypeExtension }),
    ];

    for (const snapshot of snapshots) {
      expect(
        snapshot.diagnostics.filter((d) => d.code === "SYNTHETIC_SETUP_FAILURE")
      ).toHaveLength(1);
    }

    expect(countSetupDiagnostics(snapshots, "SYNTHETIC_SETUP_FAILURE")).toBe(3);
  });
});
