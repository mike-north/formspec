# @formspec/e2e

End-to-end and benchmark workspace coverage for FormSpec.

## Usage

Run the end-to-end suite from the monorepo root:

```bash
pnpm run test:e2e
```

Run the analysis microbenchmark fixture:

```bash
pnpm --filter @formspec/e2e run benchmark:hybrid-tooling
```

## Benchmarks

### Analysis pipeline baseline (Phase 0-C)

**Script:** `benchmarks/analysis-bench.ts`
**Fixture:** `benchmarks/analysis-bench-fixture.ts` — 20-field `AnalysisBenchFixture` interface
**Baseline:** `docs/refactors/phase-0-baseline.md`

Measures `generateSchemasFromProgram` wall time, peak RSS, and synthetic `ts.createProgram`
invocation count. Used as the Phase 0-C baseline for the synthetic-checker retirement refactor.

```bash
pnpm --filter @formspec/e2e run bench:analysis
```

### Stripe Ref\<Customer\> stress test (Phase 0 / §8.4a)

**Script:** `benchmarks/stripe-ref-customer-bench.ts`
**Fixture:** `fixtures/stripe-ref-customer/` — 30-field `CustomerRefForm` class with `Ref<T>` fields
**Baseline:** `bench/baselines/stripe-ref-customer-baseline.json`

This is the named acceptance gate for generic-reference handling in the synthetic-checker
retirement refactor (see `docs/refactors/synthetic-checker-retirement.md` §8.4).

Measures wall time, peak RSS, and OOM behaviour when the full FormSpec build pipeline
processes a form class containing `Ref<Customer>`, `Ref<PaymentMethod>`, `Ref<Subscription>`,
and `Ref<Invoice>` fields backed by Stripe-like types declared in a sibling file.

```bash
pnpm --filter @formspec/e2e run bench:stripe-ref-customer
```

To capture baseline JSON:

```bash
GIT_COMMIT_SHA=$(git rev-parse HEAD) \
  pnpm --filter @formspec/e2e run bench:stripe-ref-customer \
  > stripe-ref-baseline.json 2>/dev/null
```

#### Phase 0 baseline numbers (arm64 darwin, Node v24.14.0)

| Metric | Value |
|--------|-------|
| `wallTime_ms` warm median | **44.8 ms** |
| `wallTime_ms` cold (run 1) | **1 657 ms** |
| `peakRSS_MB` warm median | **921.8 MB** |
| `didOOM` (512 MB cap) | **false** |

#### Phase comparison gates

- **Phase 4** (after host-checker migration): `peakRSS_MB` ≤ **460.9 MB**, zero OOM on 1 GB runner.
- **Phase 6** (after full synthetic deletion): `syntheticProgramCount` = 0 — no `ts.createProgram`
  calls recorded in debug logs for the whole run.

#### resolvePayload / extractPayload

PR #300 (`resolvePayload` on `CustomTypeRegistration`) was superseded by PR #308 and removed in
PR #313. This fixture uses the existing `generateSchemasFromProgram` API directly — no custom
type registration is required because PR #308 added the external-type bypass in
`extractReferenceTypeArguments` that prevents stack overflows on large SDK types. The baseline
JSON records `resolvePayloadAvailable: false` to document this. See
`fixtures/stripe-ref-customer/STUB_NOTE.md` for migration guidance if a `resolvePayload`
equivalent ever lands.

## License

This workspace is part of the FormSpec monorepo and is released under the MIT License. See
[LICENSE](./LICENSE) for details.
