# @formspec/e2e

End-to-end and benchmark workspace coverage for FormSpec.

## Usage

Run the end-to-end suite from the monorepo root:

```bash
pnpm run test:e2e
```

Run the hybrid-tooling comparison benchmark:

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

### Real Stripe SDK stress test (Phase 0 / OOM investigation)

**Script:** `benchmarks/stripe-real-sdk-bench.ts`
**Fixture:** `fixtures/stripe-real-sdk/` — `RealSdkCustomerRefForm` class with `Ref<Stripe.*>` fields backed by **real** `stripe` npm SDK types
**Baseline:** `bench/baselines/stripe-real-sdk-baseline.json`

#### Motivation

Users reported OOM when building schemas for classes with `Ref<Stripe.Customer>`-style fields
referencing types from the actual `stripe` npm package. The synthetic `stripe-ref-customer`
fixture uses hand-authored Stripe-like types (~80 properties) and does NOT reproduce the
bug — the real SDK ships types orders of magnitude larger (`Stripe.Invoice` alone is ~4 000
lines of declarations). This fixture closes the gap by importing from the real `stripe`
package.

The external-type bypass in `extractReferenceTypeArguments`
(`packages/build/src/analyzer/class-analyzer.ts`, PR #308) should fire for every
`Ref<Stripe.*>` field because the Stripe types are declared in `node_modules/stripe/...` —
a different file from the analysis root. This fixture verifies that the bypass engages
end-to-end on real SDK types and captures a baseline for Phase 4 comparison.

#### How to run

```bash
pnpm --filter @formspec/e2e run bench:stripe-real-sdk
```

To capture JSON output:

```bash
GIT_COMMIT_SHA=$(git rev-parse HEAD) \
  pnpm --filter @formspec/e2e run bench:stripe-real-sdk \
  > stripe-real-sdk-baseline.json 2>/dev/null
```

#### Phase 0 baseline numbers (arm64 darwin, Node v24.14.0, stripe 22.0.2)

| Metric | Value |
|--------|-------|
| `wallTime_ms` warm median | **82 ms** |
| `wallTime_ms` cold (run 1) | **1 519 ms** |
| `peakRSS_MB` warm median | **946.5 MB** |
| `didOOM` (1 GB cap) | **false** |

The bypass engages correctly at Phase 0: no OOM, but peak RSS is 946.5 MB — within ~80 MB
of the 1 GB cap. This confirms the external-type bypass is load-bearing for real SDK types
and that Phase 4 (host-checker migration) must bring RSS below 512 MB.

#### Phase 4 acceptance gate

- `didOOM: false` on a 1 GB runner
- `peakRSS_MB` ≤ **512 MB**

#### Caveat: stripe version dependency

This benchmark depends on the version of the `stripe` npm package installed in `e2e/`.
Bumping Stripe may shift the baseline — check `bench/baselines/stripe-real-sdk-baseline.json`
and re-run if the Stripe version changes.

## License

This workspace is part of the FormSpec monorepo and is released under the MIT License. See
[LICENSE](./LICENSE) for details.
