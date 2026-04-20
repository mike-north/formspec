# FormSpec e2e Benchmarks

Performance benchmarks for FormSpec's analysis pipeline. These scripts are
developer tools — they are not part of the test suite run by `pnpm test`.

## Benchmarks

### `analysis-bench.ts` — Phase 0-C analysis pipeline baseline

Measures `generateSchemasFromProgram` wall time + peak RSS and
`FormSpecSemanticService.getDiagnostics` synthetic-program count against the
20-field `AnalysisBenchFixture`.

**Run:**

```sh
pnpm --filter @formspec/e2e run bench:analysis
```

Output: JSON to stdout, human-readable summary to stderr.

---

### `synthetic-checker-baseline.bench.ts` — Phase 0.5k synthetic-checker baseline

**Purpose:** Phase 0 canary for the synthetic-checker retirement refactor.
Measures `buildFormSpecAnalysisFileSnapshot` (the snapshot path used by the
ts-plugin and language server) against the 20-field `AnalysisBenchFixture`.
Phase 4 of the refactor **must not regress** warm-median wall time against the
numbers stored in `baselines/synthetic-checker-baseline.json`.

See [`docs/refactors/synthetic-checker-retirement.md`](../../docs/refactors/synthetic-checker-retirement.md)
§9.2 #8 for context.

**Run:**

```sh
pnpm --filter @formspec/e2e run bench:synthetic-checker
```

Output: JSON to stdout (machine-readable), human-readable summary to stderr.

**Refresh the baseline** (after an intentional perf change — requires reviewers
to approve the updated numbers):

```sh
pnpm --filter @formspec/e2e run bench:synthetic-checker \
  > benchmarks/baselines/synthetic-checker-baseline.json
```

#### What the metrics mean

| Metric | Description |
|---|---|
| `wallTimeMs.cold` | First invocation; empty module-level LRU cache. Dominated by `ts.createProgram` inside the synthetic checker. |
| `wallTimeMs.warmMedian` | Median over runs 2–50; cache fully warm. Phase 4 regression gate. |
| `wallTimeMs.warmP95` | 95th-percentile over runs 2–50. Useful for spotting outliers. |
| `syntheticBatchCalls.coldProgramCount` | Number of `ts.createProgram` calls inside the synthetic checker on the cold run. After Phase 4 this should drop to 0. |
| `syntheticBatchCalls.warmCacheHitsTotal` | Total cache hits across warm runs (runs 2–50). After Phase 4 this metric becomes less meaningful since the synthetic path is gone. |
| `memoryDeltaBytes` | RSS delta across the full run set. Coarse; GC timing affects accuracy. |

#### Phase 4 regression gate

After Phase 4 lands, run this benchmark against the post-refactor build and
compare `warmMedian` against the baseline:

- `warmMedian` ≤ baseline `warmMedian` → pass
- `warmMedian` > baseline `warmMedian` → investigate before merging

The benchmark is a canary, not a tight SLA. A small regression (~10–20%) is
acceptable if explainable; a large one (>2×) indicates a regression.

#### Fixture

`analysis-bench-fixture.ts` — 20-field TypeScript interface with ~36
constraint tags spread across numeric (`@minimum`, `@maximum`,
`@exclusiveMinimum`, `@exclusiveMaximum`, `@multipleOf`), string
(`@minLength`, `@maxLength`, `@pattern`), array (`@minItems`, `@maxItems`,
`@uniqueItems`), enum (`@enumOptions`), const (`@const`), and path-target
variants. Every builtin constraint tag is exercised at least once.

---

### `hybrid-tooling-benchmark.ts` — Hybrid tooling comparison

Compares direct `FormSpecSemanticService`, plugin IPC, and packaged language
server paths across diagnostics, completion, and hover operations.

**Run:**

```sh
pnpm --filter @formspec/e2e run benchmark:hybrid-tooling
```
