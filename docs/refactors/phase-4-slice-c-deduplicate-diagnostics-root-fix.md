# Phase 4 Slice C follow-up: eliminate `deduplicateDiagnostics`

## Status

Deferred. The Phase 4 Slice C PR (setup-diagnostic relocation) ships with a
temporary `deduplicateDiagnostics` helper in
`packages/build/src/analyzer/class-analyzer.ts`. The helper is safe — it
filters only the two setup-diagnostic codes
(`SYNTHETIC_SETUP_FAILURE`, `UNSUPPORTED_CUSTOM_TYPE_OVERRIDE`) and leaves
per-field diagnostics untouched — but it is a symptom-fix that should be
retired in a follow-up.

## Why the helper exists

When an `ExtensionRegistry` has setup failures, every field in a class,
interface, or type alias triggers an independent call to `parseTSDocTags`.
Each call returns the same setup diagnostic (anchored at the registry-level
provenance `{surface: "extension", line: 1, column: 0}`). Without
deduplication, an N-field declaration produces N identical setup diagnostics.

## Why the helper should go away

1. **Wasted work.** Every field walks the same registry state and produces
   the same diagnostic, which the helper then throws away.
2. **Fragile invariant.** The helper only works because setup diagnostics
   share a provenance. Future diagnostic codes with the same dedup-eligible
   shape would have to be added to the allowlist manually.
3. **Dead code path.** `parseTSDocTags` has an early-return for
   registry-has-setup-failure (the "silent drop" path). That path exists only
   to avoid emitting garbage tag-level diagnostics when the registry is
   broken; the setup diagnostic itself could be emitted at a higher level.

## Proposed structural fix

Move setup-diagnostic emission **out of** `parseTSDocTags` entirely and
into the three declaration-level entrypoints in
`packages/build/src/analyzer/class-analyzer.ts`:

- `analyzeClassToIR`
- `analyzeInterfaceToIR`
- `analyzeTypeAliasToIR`

At the top of each, when
`extensionRegistry?.setupDiagnostics.length > 0`:

1. Call `_emitSetupDiagnostics(extensionRegistry.setupDiagnostics, file)`
   once and append to the diagnostics accumulator.
2. Pass `undefined` (or a sentinel "suppressed" registry) to the per-field
   `parseTSDocTags` calls so they skip setup-diag re-emission.

This mirrors the pattern already used in
`packages/analysis/src/file-snapshots.ts:1827-1847`
(`buildFormSpecAnalysisFileSnapshot`), which pre-emits setup diagnostics
once and then passes `setupDiagnosticsPreEmitted: true` downstream.

After the restructure, `deduplicateDiagnostics` and the
`DEDUPLICATABLE_DIAGNOSTIC_CODES` constant can be deleted, and the
`parseTSDocTags` silent-drop early-return can be simplified (it no longer
needs to re-emit the setup diagnostic; it can return empty results cleanly).

## Scope notes

- The restructure touches three declaration-level entrypoints; each one has
  multiple callers. Plan on an API review of the "suppressed registry"
  parameter shape.
- Existing tests that assert per-snapshot-call emission count
  (`setup-diagnostic-emission-count.test.ts`) should continue to pass
  unchanged; the count semantics are preserved.
- The `deduplicate-diagnostics.test.ts` unit tests can be deleted with the
  helper.

## Owner / tracking

- Source: Phase 4 Slice C review feedback
  (see `.changeset/phase-4-slice-c-setup-diagnostic-relocation.md`)
- Linked in-code TODO:
  `packages/build/src/analyzer/class-analyzer.ts` (see comment on
  `deduplicateDiagnostics`)
