---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Phase 5 Slice C follow-up — ordering fix, test migration, and cleanup (addresses panel review of #401).

Three targeted changes following the Phase 5 Slice C synthetic-checker retirement:

**Role-A/B ordering fix (`packages/analysis/src/file-snapshots.ts`)**
Hoists the Role-A placement pre-check (`getMatchingTagSignatures`) above the
`isBuiltinConstraintName` guard in the snapshot consumer's `buildTagDiagnostics`. The
build consumer already ran Role A → Role B → Role C in the correct order; the snapshot
consumer was checking Role B (capability guard) first for built-in constraint tags,
diverging from the guaranteed execution sequence. The parity-harness proxy in
`parity-harness.test.ts` is corrected to match, and a new type-alias fixture pins the A→B
ordering for the "misplaced + type-incompatible" case.

**Narrow-applicability migration tests (`packages/analysis/src/__tests__/non-constraint-tag-dispatch.test.ts`)**
Adds 101 migration tests restoring coverage removed when the synthetic-checker module was
deleted. Coverage includes: 96 parametric tests (16 non-constraint tags × 6 field-type
shapes = zero diagnostics each), 3 unknown-tag silent-ignore tests, and 2 nullable-intermediate
path-traversal tests.

**Auto-fixable cleanup from panel review**
- `packages/build/src/analyzer/tsdoc-parser.ts`: Rename `SYNTHETIC_TYPE_FORMAT_FLAGS` → `TYPE_FORMAT_FLAGS`; remove stale "before the synthetic-checker call" comment block
- `ARCHITECTURE.md`: Update DEBUG namespace from `:synthetic` to `:registry`
- `e2e/benchmarks/README.md`: Delete stale section documenting the deleted benchmark file
- `packages/ts-plugin/src/semantic-service.ts`: Document the intentional no-op `updateStatsFromPerformanceEvents` method
- `e2e/benchmarks/stripe-realistic-tsserver-bench.ts`: Mark `syntheticCompileCount` as `@deprecated`
- `packages/analysis/src/lru-cache.ts` + tests: Delete (zero in-source consumers after retirement)
