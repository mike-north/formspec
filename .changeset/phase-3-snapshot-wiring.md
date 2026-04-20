---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Wire typed argument parser into snapshot consumer (Phase 3)

Routes the snapshot consumer's Role C (argument-literal validation)
through parseTagArgument. The synthetic TypeScript checker still handles
Roles A/B/D1/D2 until Phase 4. Fixes the snapshot-side subset of
silent-acceptance bugs tracked in #326 and completes normalization of
build/snapshot divergences #329/#330 that Phase 2 began. Implements §4
Phase 3 of docs/refactors/synthetic-checker-retirement.md.
