---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Add cross-consumer parity harness (Phase 0.5a, §9.1 #1)

Introduces `packages/analysis/src/__tests__/parity-harness.test.ts`, a parametric fixture suite (tag × subject type × argument shape) that runs both the build and snapshot consumers on each input and asserts either diagnostic equality or a known-divergence entry. The `KNOWN_DIVERGENCES` list pins the three catalogued lowering differences from §3 of the refactor plan plus the integer-brand snapshot gap surfaced in #315.

Consumes the parity-log schema + diff helper from #316.

Test-only change; no source modifications.
