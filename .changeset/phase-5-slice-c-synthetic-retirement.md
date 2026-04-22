---
"@formspec/analysis": minor
"@formspec/build": minor
"@formspec/cli": minor
"@formspec/eslint-plugin": minor
"@formspec/language-server": minor
"@formspec/ts-plugin": minor
"formspec": minor
---

Phase 5 Slice C — retire the synthetic TypeScript program batch.

Deletes the parallel-program constraint-tag checker that drove role-D validation in both
consumers. Constraint-tag validation now flows through three unified stages in both the
build and snapshot consumers:

- Role A — placement pre-check (`getMatchingTagSignatures`)
- Role B — capability guard, now extended to cover path-targeted tags in the snapshot
  consumer (`_supportsConstraintCapability` + `resolvePathTargetType`)
- Role C — typed-parser argument validation (`parseTagArgument`)

The `@formspec/analysis/internal` export surface loses the synthetic-checker entry points
(`checkSyntheticTagApplication`, `checkSyntheticTagApplications`,
`checkSyntheticTagApplicationsDetailed`, `lowerTagApplicationToSyntheticCall`,
`buildSyntheticHelperPrelude`, `checkNarrowSyntheticTagApplicability` /
`…Applicabilities`, `FORM_SPEC_SYNTHETIC_BATCH_CACHE_ENTRIES`,
`_mapGlobalSyntheticTsDiagnostics`) along with their option and result types. These were
documented as `@internal` and never part of the public API surface. The retained
setup-diagnostic helpers (`_validateExtensionSetup`, `_emitSetupDiagnostics`,
`_mapSetupDiagnosticCode`, `SetupDiagnostic` — renamed from `SyntheticCompilerDiagnostic`)
continue to anchor extension registry setup failures.

`FormSpecSemanticServiceStats` in `@formspec/ts-plugin` drops the four synthetic counters
(`syntheticBatchCacheHits`, `syntheticBatchCacheMisses`, `syntheticCompileCount`,
`syntheticCompileApplications`). Query totals and file-snapshot cache hit/miss ratios
remain and cover the same warm/cold semantics.

The §8.4b memory gate target is peak RSS ≤ 700 MB on `stripe-realistic-build`; the Phase
5C measurement is 769.5 MB — a 91.8 MB (10.7%) improvement over the Phase 0 baseline of
861.3 MB but 69.5 MB above the gate. The synthetic `ts.createProgram` surface is fully
retired (no more `analysis.syntheticCheckBatch.*` performance events); remaining headroom
will be pursued as a follow-up.

Per the repo's lockstep release convention, changes under `packages/<name>/src` bump the
affected package and all transitively-dependent packages. `@formspec/analysis` takes a
minor bump because removed symbols from `./internal` may break deep-imports;
`@formspec/ts-plugin` takes a minor bump because `FormSpecSemanticServiceStats` (a
`@public` interface) removes four `readonly` counters. All other `@formspec/*` packages
take a minor bump together under the lockstep version-link convention.
