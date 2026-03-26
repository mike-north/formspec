# Skip Report

Generated from `origin/main` at commit `271071e`.

## Result

The active test tree contains no remaining skips or `BUG:` markers.

## Completed Burn-Down

The following formerly skipped/non-normative areas are now implemented on `main`:

- annotation/display-name/description/default/placeholder/deprecation emission
- literal and array constraint emission (`@const`, `@format`, `@uniqueItems`, item-level string constraints)
- supported diagnostics (`UNKNOWN_PATH_TARGET`, `CONSTRAINT_BROADENING`)
- CLI compiled-fixture harness cleanup
- mixed-authoring overlays
- recursive circular-reference support via emitted `$defs` / `$ref`
- cross-axis conditional flattening

## No Longer Present

The codebase no longer contains:

- `loadExpected(...)`
- `e2e/expected/`
- gold-master expected JSON infrastructure
- active skipped tests or anonymous `BUG:` placeholders

Historical documentation may still mention snapshots or gold-master terminology while describing rejected strategies or past decisions, but production tests no longer depend on them.
