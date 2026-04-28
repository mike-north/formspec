# FormSpec e2e Benchmarks

Performance benchmarks for FormSpec's analysis pipeline. These scripts are
developer tools — they are not part of the test suite run by `pnpm test`.

## Benchmarks

### `analysis-bench.ts` — Phase 0-C analysis pipeline baseline

Measures `generateSchemasFromProgram` wall time + peak RSS and
`FormSpecSemanticService.getDiagnostics` file-snapshot cache per-run
hit/miss deltas (fresh-service) against the 20-field `AnalysisBenchFixture`.

**Run:**

```sh
pnpm --filter @formspec/e2e run bench:analysis
```

Output: JSON to stdout, human-readable summary to stderr.

---

### `hybrid-tooling-benchmark.ts` — Hybrid tooling comparison

Compares direct `FormSpecSemanticService`, plugin IPC, and packaged language
server paths across diagnostics, completion, and hover operations.

**Run:**

```sh
pnpm --filter @formspec/e2e run benchmark:hybrid-tooling
```
