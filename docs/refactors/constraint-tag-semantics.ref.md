# Constraint-Tag Semantics Quick-Reference

**Purpose.** This document is a semantics-preservation aid for Phase 2/3 reviewers.
It lists the ~15 most-exercised constraint-tag / subject-type / argument-shape combinations,
with the pinned outcome each consumer produces today and a cross-reference to the test that
pins it. It is NOT a spec — the tests themselves are the spec.

## Legend

| Column | Meaning |
|---|---|
| Tag | TSDoc constraint tag name (without `@`) |
| Subject type | TypeScript type of the annotated field |
| Argument | Raw tag argument text as it appears in the comment; `—` = no argument |
| Build outcome | Result of the build-path consumer (`renderSyntheticArgumentExpression` → `checkSyntheticTagApplication` → IR validate) |
| Snapshot outcome | Result of the snapshot-path consumer (`getArgumentExpression` → batch synthetic check → code translation layer) |
| Diag code | FormSpec diagnostic code emitted on failure; `—` = no diagnostic |
| Tested by | PR number + test file path (relative to repo root) |

Outcome symbols: **pass** = no diagnostic; **TYPE_MISMATCH** / **INVALID_TAG_ARGUMENT** = diagnostic code emitted.

## Combination Table

| # | Tag | Subject type | Argument | Build outcome | Snapshot outcome | Diag code | Tested by |
|---|---|---|---|---|---|---|---|
| 1 | `minimum` | `number` | `0` | pass | pass | — | PR #324 `packages/analysis/src/__tests__/parity-harness.test.ts` |
| 2 | `minimum` | `string` | `0` | pass | pass | — (silent gap) | PR #318 `packages/analysis/src/__tests__/constraint-canaries.test.ts` (`.fails`) |
| 3 | `minimum` | `Integer` (build bypass) | `0` | pass (bypass) | diverges (gap) | — / any | PR #315 `packages/analysis/src/__tests__/file-snapshots.integer-bypass.test.ts` |
| 4 | `minimum` | `Integer` (snapshot path) | `0` | pass (bypass) | diverges | any | PR #324 `packages/analysis/src/__tests__/parity-harness.test.ts` (known divergence) |
| 5 | `maximum` | `number` | `100` | pass | pass | — | PR #324 `packages/analysis/src/__tests__/parity-harness.test.ts` |
| 6 | `minLength` | `string` | `1` | pass | pass | — | PR #324 `packages/analysis/src/__tests__/parity-harness.test.ts` |
| 7 | `minLength` | `number` | `1` | TYPE_MISMATCH | TYPE_MISMATCH | `TYPE_MISMATCH` | PR #324 `packages/analysis/src/__tests__/parity-harness.test.ts` |
| 8 | `pattern` | `string` | `^\d+$` | pass | pass | — | PR #324 `packages/analysis/src/__tests__/parity-harness.test.ts` |
| 9 | `pattern` | `number` | `^\d+$` | pass | pass | — (silent gap) | PR #318 `packages/analysis/src/__tests__/constraint-canaries.test.ts` (`.fails`) |
| 10 | `enumOptions` | `string` | `["a","b"]` | pass | pass | — | PR #324 `packages/analysis/src/__tests__/parity-harness.test.ts` |
| 11 | `const` | `number` | `"USD"` | pass | pass | — | PR #324 `packages/analysis/src/__tests__/parity-harness.test.ts` |
| 12 | `const` | `string` | `"USD"` | pass | pass | — | PR #324 `packages/analysis/src/__tests__/parity-harness.test.ts` |
| 13 | `uniqueItems` | `string[]` | — | pass | pass | — | PR #324 `packages/analysis/src/__tests__/parity-harness.test.ts` |
| 14 | `maximum` | `P` (alias chain: `P = NN = number`, `@minimum 0` on `NN`) | `100` | pass | diverges (alias-name gap) | `TYPE_MISMATCH` (snapshot) | PR #324 `packages/analysis/src/__tests__/parity-harness.test.ts` (known divergence) |
| 15 | `exclusiveMinimum` | object field with `:amount: number` path-target | `0` (D2) | pass | pass | — | PR #317 `packages/build/src/__tests__/generate-schemas-config.test.ts` lines 340-350 |

## Known Divergences (§3)

The three inputs in §3 of `docs/refactors/synthetic-checker-retirement.md` where the build and
snapshot consumers already diverge today. The refactor does NOT normalize these — normalization
is a separate named PR after Phase 3.

| Input | Build consumer today | Snapshot consumer today | Tested by |
|---|---|---|---|
| `@const not-json` on `number` | `renderSyntheticArgumentExpression` JSON-stringifies invalid JSON to `'"not-json"'`; synthetic type check passes (string ≤ unknown); IR validator catches string-vs-number → **TYPE_MISMATCH** | `getArgumentExpression` returns `null` for invalid JSON, omitting the argument; synthetic call `tag_const(ctx)` missing required arg → **INVALID_TAG_ARGUMENT** (`"Expected 2-3 arguments, but got 1."`) | PR #317 `packages/build/src/__tests__/parity-divergences.test.ts` |
| `@minimum Infinity` on `number` | `Number.isFinite(Infinity) = false` → stringified to `'"Infinity"'` (string); `tag_minimum` expects number; string not assignable → **TYPE_MISMATCH** | `"Infinity"` passed through as identifier; `Infinity` is `number` in TS globals → **no diagnostic** | PR #317 `packages/build/src/__tests__/parity-divergences.test.ts` |
| `@minimum NaN` on `number` | `Number.isFinite(NaN) = false` → stringified to `'"NaN"'` (string); `tag_minimum` expects number; string not assignable → **TYPE_MISMATCH** | `"NaN"` passed through as identifier; `NaN` is `number` in TS globals → **no diagnostic** | PR #317 `packages/build/src/__tests__/parity-divergences.test.ts` |

**Post-#317 refined view on `@const not-json`:** both consumers DO detect the invalid input — just
at different pipeline stages. The snapshot path catches it early at lowering time
(`INVALID_TAG_ARGUMENT`). The build path defers to IR validation (`TYPE_MISMATCH`). Phase 2/3
normalization should align on the snapshot behavior: reject at lowering rather than deferring to
the IR validator.
