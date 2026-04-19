---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Add pinned regression tests for three known build/snapshot consumer divergences (`@const not-json`, `@minimum Infinity`, `@minimum NaN`). These tests anchor Phase 2/3 normalization work in the synthetic-checker retirement plan.
