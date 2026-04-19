---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Add parity-harness log schema and diffing helper (Phase 0.5m)

Introduces two new test-internal helpers in `packages/analysis/src/__tests__/helpers/`:

- `parity-log-entry.ts` — the `ParityLogEntry` TypeScript type (with `RoleOutcome` union) and an `isParityLogEntry` runtime type-guard that validates the full shape including the optional `diagnostic` sub-object.
- `diff-parity-logs.ts` — `diffParityLogs(buildEntries, snapshotEntries): ParityDivergence[]`, a deterministic diffing function that normalizes entries by `tag + placement + subjectTypeKind` and reports three categories of divergence: one-sided missing entries, differing `roleOutcome` values, and differing diagnostic `code` values.

These helpers are not exported from the package; they are consumed by the cross-consumer parity harness (Phase 0.5a).

Implements §8.3e and §9.4 item 0.5m of `docs/refactors/synthetic-checker-retirement.md`.
