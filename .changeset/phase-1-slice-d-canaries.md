---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Add canary + registry-sweep tests for the typed argument parser (Phase 1 Slice D)

Rounds out Phase 1 with cross-family invariant tests, silent-acceptance
canaries (tied to Issue #326), an exhaustive 13×3 registry sweep, and
expanded "Expected " prefix coverage across all 6 families. Closes out
the Phase 1 checklist per §4 of the retirement plan; Phase 2 (build
consumer wiring) is now unblocked.
