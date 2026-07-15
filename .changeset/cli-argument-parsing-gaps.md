---
"@formspec/cli": patch
---

Fixed argument-parsing gaps: `-o/--output` and `-c/--compiled` now error with a clear "missing value" message instead of silently falling back to defaults when given without a value; an unexpected extra positional argument now errors naming the ignored argument instead of being silently dropped; the `--validate-only` failure summary is now written to stderr (matching per-diagnostic output) instead of stdout.
