# Phase 0-C Analysis Microbenchmark Baseline

Captured during Phase 0-C of the synthetic-checker retirement refactor.
See [`docs/refactors/synthetic-checker-retirement.md`](./synthetic-checker-retirement.md) §8.2 for performance criteria and §9.2 #8 for the benchmark specification.

## Fixture

**File:** `e2e/benchmarks/analysis-bench-fixture.ts`  
**Type:** `AnalysisBenchFixture`  
**Fields:** 20 fields covering the full constraint-tag vocabulary:
- 8 numeric fields: `@minimum`, `@maximum`, `@exclusiveMinimum`, `@exclusiveMaximum`, `@multipleOf`
- 4 string fields: `@minLength`, `@maxLength`, `@pattern`
- 2 array fields: `@minItems`, `@maxItems`, `@uniqueItems`
- 2 enum-ish fields: `@enumOptions`
- 2 const fields: `@const`
- 2 path-target fields: nested property constraints via `:propertyName` syntax

## Baseline Measurements

| Metric | Value | Notes |
|--------|-------|-------|
| `wallTimeMs` (warm median, runs 2–5) | **35.40 ms** | Steady-state `generateSchemasFromProgram` cost; excludes module-load overhead |
| `wallTimeMs` (cold, run 1) | **1 613 ms** | Includes TypeScript module load + first-run JIT + empty synthetic-batch cache |
| `peakRssBytes` (warm median) | **955.9 MB** (1 002 307 584 bytes) | Peak RSS across runs 2–5 of `generateSchemasFromProgram` |
| `syntheticProgramCount` (cold) | **20** | Distinct `ts.createProgram` invocations during constraint-tag validation (one per constraint batch) |

**Commit SHA:** `7288e3b105fa49a23db18eb0dda504b0da898239`  
**Node version:** v24.14.0  
**Platform:** darwin / arm64

## Methodology Notes

### Warm vs. cold runs

Run 1 (cold) includes TypeScript module load and JIT compilation. The steady-state wall time (warm median over runs 2–5) is the number that matters for regression detection — it isolates the analysis pipeline cost from process startup overhead.

### Synthetic-program count

TypeScript 5.9+ publishes its exports as non-configurable getter properties. Monkey-patching `ts.createProgram` at runtime is not possible on Node.js 24 (`Cannot redefine property: createProgram`). The count is therefore obtained via `FormSpecSemanticService.getStats().syntheticCompileCount`, which increments on every `ts.createProgram` call inside the `@formspec/analysis` synthetic-checker. The service uses the same synthetic-checker code path as `generateSchemasFromProgram`.

**Cold vs. warm behavior:** `@formspec/analysis` maintains a module-level LRU cache (`syntheticBatchResultCache`, 64 entries). After the first (cold) run, all 20 constraint batches are cached. Subsequent warm runs produce 0 synthetic-program constructions. Only the cold count (20) is meaningful for Phase 4 comparison.

### Phase 4 comparison targets

Per §8.2 of the refactor plan:

- `wallTimeMs` warm: must not regress by more than 5% (≤ **37.17 ms**)
- `peakRssBytes` warm: must not regress by more than 10% (≤ **1 052 MB**)
- `syntheticProgramCount` cold: Phase 4 goal is to eliminate all 20 constructions (target: **0**)

## How to Re-run

```bash
pnpm --filter @formspec/e2e run bench:analysis
```

The script outputs JSON to stdout and a human-readable table to stderr.
To capture the JSON for diffing:

```bash
GIT_COMMIT_SHA=$(git rev-parse HEAD) \
  pnpm --filter @formspec/e2e run bench:analysis \
  > bench-results.json 2>/dev/null
```
