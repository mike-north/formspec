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

Measures `generateSchemasFromProgram` wall time and peak RSS, plus
`FormSpecSemanticService.getDiagnostics` file-snapshot cache per-run hit/miss
deltas (fresh-service).
Used as the Phase 0-C baseline for the synthetic-checker retirement refactor.

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

---

### Stripe realistic OOM sweep — all four consumer surfaces (Phase 0)

**Motivation:** Users report OOM when building forms that import types from the `stripe` npm SDK
directly. Prior fixtures (`stripe-ref-customer`, `stripe-real-sdk`) used a `Ref<T>` wrapper with
a `__type` phantom property that deliberately bypasses walking into Stripe types (PR #308's
external-type bypass). They never exercised the OOM path.

This sweep covers the code path real users hit: `Stripe.Customer`, `Stripe.Invoice`, etc.
embedded **directly** in the form class — no wrapper — across **all four** consumer surfaces
(build, LSP snapshot, ESLint, tsserver plugin). One command per surface; all four write their own
baseline JSON so Phase 4 gate progress can be tracked individually.

**Fixture:** `fixtures/stripe-realistic-oom/checkout-form.ts` — `CheckoutForm` class with
11 fields including `Stripe.Customer`, `Stripe.PaymentMethod`, `Stripe.Subscription`,
`Stripe.Invoice`, and `Stripe.TaxId` plus primitive fields with TSDoc constraints.

#### Surface 1 — build (`generateSchemasFromProgram`)

**Script:** `benchmarks/stripe-realistic-build-bench.ts`
**Baseline:** `bench/baselines/stripe-realistic-build-baseline.json`

```bash
pnpm --filter @formspec/e2e run bench:stripe-realistic-build
```

#### Surface 2 — snapshot (`buildFormSpecAnalysisFileSnapshot`)

Models the LSP/editor analysis hot path.

**Script:** `benchmarks/stripe-realistic-snapshot-bench.ts`
**Baseline:** `bench/baselines/stripe-realistic-snapshot-baseline.json`

```bash
pnpm --filter @formspec/e2e run bench:stripe-realistic-snapshot
```

#### Surface 3 — ESLint (`type-compatibility/tag-type-check` rule)

Uses the ESLint JS API with `@typescript-eslint/parser` and `parserOptions.project`. The
`tag-type-check` rule has its own TypeChecker creation path — separate from the build and
snapshot surfaces.

**Script:** `benchmarks/stripe-realistic-eslint-bench.ts`
**Baseline:** `bench/baselines/stripe-realistic-eslint-baseline.json`

```bash
pnpm --filter @formspec/e2e run bench:stripe-realistic-eslint
```

#### Surface 4 — tsserver plugin (`FormSpecSemanticService.getDiagnostics`)

Instantiates `FormSpecSemanticService` directly (same code path tsserver loads) and reuses the
same service to call `getDiagnostics` three times: once cold (open-file) and twice warm
(first keystroke, second keystroke). This models a real editor session rather than cold-starting
a new service per call.

**Script:** `benchmarks/stripe-realistic-tsserver-bench.ts`
**Baseline:** `bench/baselines/stripe-realistic-tsserver-baseline.json`

```bash
pnpm --filter @formspec/e2e run bench:stripe-realistic-tsserver
```

#### Phase 0 baseline numbers (arm64 darwin, Node v24.14.0, 1 GB OOM cap)

| Surface | `peakRSS_MB` | `wallTime_ms` cold | `wallTime_ms` warm median | `didOOM` (1 GB) |
|---------|--------------|-------------------|--------------------------|-----------------|
| **build** | **861.3 MB** (warm median) | 432.7 ms | 81.5 ms | **false** |
| **snapshot** | **843.8 MB** (warm median) | 290.4 ms | 7.1 ms | **false** |
| **eslint** | **519.1 MB** (warm median) | 420.2 ms | 2.8 ms | **false** |
| **tsserver-plugin** | **567.4 MB** (session) | 373.8 ms | ~0 ms | **false** |

Notes on tsserver-plugin: the bench creates one service and calls `getDiagnostics` 3× (one
open-file call plus two keystroke re-analyses) on the same instance. Session RSS is measured
across all three calls. Warm wall-time is near-zero because the service caches analysis results
across calls.

All four surfaces came in under 1 GB — none OOMed on this machine (M-series arm64, Node v24.14.0).
Build / snapshot are above 840 MB, within 180 MB of the 1 GB cap. A machine with less available
RSS headroom, or a stripe SDK version with larger type graphs, would push these over. The ESLint
surface is cheaper (~519 MB) because the `@typescript-eslint/parser` creates its own TypeScript
program and the ESLint rule only inspects the checked file rather than walking the full schema
emission pipeline.

**Interpretation for Phase 4:**
These numbers are the acceptance-gate baselines. After the host-checker migration (Phase 4),
all four surfaces must show `peakRSS_MB` ≤ 50% of the corresponding value above, with `didOOM`
still `false` at 1 GB cap.

**Reference contrast — prior synthetic-fixture baselines:**

| Fixture | Approach | `peakRSS_MB` | `didOOM` (512 MB cap) |
|---------|---------|--------------|----------------------|
| `stripe-ref-customer` | `Ref<T>` wrapper, build only | 921.8 MB | false |
| `stripe-realistic-oom` (this) | Direct Stripe types, 4 surfaces | 567–861 MB | false |

The `Ref<T>` fixture engaged the external-type bypass (PR #308) which prevented walking Stripe's
internal type graph. The realistic fixture forces the full walk and lands at similar RSS levels for
build/snapshot — confirming the bypass is not what prevented OOM in prior measurements.

## License

This workspace is part of the FormSpec monorepo and is released under the MIT License. See
[LICENSE](./LICENSE) for details.
