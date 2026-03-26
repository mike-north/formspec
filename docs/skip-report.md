# Skip Report

Generated from `origin/main` at commit `d7f10fe`.

## Remaining Skips

Only one skipped test remains in code:

- [e2e/tests/cli-subprocess.test.ts](/Users/mnorth/Development/formspec/.worktrees/skip-burndown-main/e2e/tests/cli-subprocess.test.ts)
  - `BUG: circular references should fail clearly instead of silently degrading`
  - Classification: deferred feature
  - Tracking issue: `#105`

## Completed Burn-Down

The following formerly skipped/non-normative areas are now implemented on `main`:

- annotation/display-name/description/default/placeholder/deprecation emission
- literal and array constraint emission (`@const`, `@format`, `@uniqueItems`, item-level string constraints)
- supported diagnostics (`UNKNOWN_PATH_TARGET`, `CONSTRAINT_BROADENING`)
- CLI compiled-fixture harness cleanup

## No Longer Present

The codebase no longer contains:

- `loadExpected(...)`
- `e2e/expected/`
- gold-master expected JSON infrastructure

Historical documentation may still mention snapshots or gold-master terminology while describing rejected strategies or past decisions, but production tests no longer depend on them.
