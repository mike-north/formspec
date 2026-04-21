/**
 * Pins the setup-diagnostic emission-count model after Phase 4 Slice C relocation.
 *
 * Phase 4 Slice C relocated UNSUPPORTED_CUSTOM_TYPE_OVERRIDE and
 * SYNTHETIC_SETUP_FAILURE from the per-batch `runBatchSyntheticCheck` call site
 * into a pre-validation pass at the top of `buildFormSpecAnalysisFileSnapshot`.
 * Before relocation the same count held, but for a different reason — setup
 * failures threw before the LRU cache key was computed, so each call produced
 * a new diagnostic. After relocation, setup validation runs once per snapshot
 * call via `_validateExtensionSetup`, and `buildTagDiagnostics` no longer
 * participates in setup-diagnostic emission.
 *
 * Post-Phase-4 Slice C emission model: PER-SNAPSHOT-CALL (pre-emitted at file level)
 *   - One `UNSUPPORTED_CUSTOM_TYPE_OVERRIDE` or `SYNTHETIC_SETUP_FAILURE` diagnostic
 *     is produced each time `buildFormSpecAnalysisFileSnapshot` is called with an
 *     extension that has a broken setup.
 *   - The diagnostic is anchored at the file start (span {start:0, end:0}), not at
 *     any individual tag location, because the failure is registry-level.
 *   - Consequence: N snapshot refreshes → N diagnostics; re-creating the
 *     "extensions" array (constructing a new config object and running again)
 *     produces the same count-per-call as using the original config, since
 *     `_validateExtensionSetup` always runs per call.
 *
 * @see docs/refactors/synthetic-checker-retirement.md §4 Phase 4 Slice C
 * @see packages/analysis/src/compiler-signatures.ts (_validateExtensionSetup)
 * @see packages/analysis/src/__tests__/compiler-signatures.test.ts lines 404-431
 */

import { describe, expect, it } from "vitest";
import { buildFormSpecAnalysisFileSnapshot } from "../internal.js";
import { createProgram } from "./helpers.js";

/**
 * A TypeScript source file that contains exactly one FormSpec comment block
 * with constraint tags. The source is deliberately minimal: one interface with
 * one commented field. This means each `buildFormSpecAnalysisFileSnapshot`
 * call runs exactly one synthetic batch for that comment block; even though
 * the block contains multiple tags, every setup failure still produces exactly
 * one global diagnostic per call.
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
    (acc, snapshot) => acc + snapshot.diagnostics.filter((d) => d.code === code).length,
    0
  );
}

describe("setup-diagnostic emission-count stability (Phase 4 Slice C)", () => {
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

  it("accumulates one diagnostic per call across three repeated snapshot refreshes (pre-emitted at snapshot level)", () => {
    const { checker, sourceFile } = createProgram(
      SOURCE_WITH_ONE_COMMENT_BLOCK,
      "/virtual/emission-count-repeat.ts"
    );

    // Simulate three IDE snapshot refreshes on the same file with the same
    // extension config. After Phase 4 Slice C, each call independently
    // invokes _validateExtensionSetup (at the top of buildFormSpecAnalysisFileSnapshot)
    // and pre-emits any setup diagnostics before visiting nodes. The per-call
    // count remains 1 — the mechanism changed (pre-emit instead of batch-emit)
    // but the observable behaviour (one diagnostic per refresh) is preserved.
    const extensions = [...ARRAY_OVERRIDE_EXTENSION];
    const snapshots = [
      buildFormSpecAnalysisFileSnapshot(sourceFile, { checker, extensions }),
      buildFormSpecAnalysisFileSnapshot(sourceFile, { checker, extensions }),
      buildFormSpecAnalysisFileSnapshot(sourceFile, { checker, extensions }),
    ];

    // Each call still produces exactly one diagnostic (pre-emitted at file level);
    // three calls total = 3.
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
    // identical values and run one additional snapshot refresh. After Phase 4
    // Slice C, _validateExtensionSetup always runs per buildFormSpecAnalysisFileSnapshot
    // call — there is no cross-call deduplication. Each call with a broken
    // extension config produces exactly one setup diagnostic regardless of
    // whether the extensions array is the same reference or a new object.
    //
    // Expected delta: +1 (same per-call cost regardless of config object identity).
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

  it("pins the same per-snapshot-call emission model for SYNTHETIC_SETUP_FAILURE (invalid type name)", () => {
    // SYNTHETIC_SETUP_FAILURE uses the same _validateExtensionSetup code-path as
    // UNSUPPORTED_CUSTOM_TYPE_OVERRIDE. Pin this separately so a future change
    // cannot silently drop the second setup-error kind.
    //
    // Post-Phase-4 Slice C emission model: pre-emitted at snapshot level — one diagnostic per call.
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
      expect(snapshot.diagnostics.filter((d) => d.code === "SYNTHETIC_SETUP_FAILURE")).toHaveLength(
        1
      );
    }

    expect(countSetupDiagnostics(snapshots, "SYNTHETIC_SETUP_FAILURE")).toBe(3);
  });
});
