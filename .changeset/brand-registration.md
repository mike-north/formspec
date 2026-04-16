---
"@formspec/core": minor
"@formspec/build": minor
"@formspec/analysis": patch
"@formspec/cli": patch
"@formspec/config": patch
"@formspec/dsl": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/runtime": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Add `brand` field to `CustomTypeRegistration` for structural type detection via unique symbol brands. More reliable than `tsTypeNames` string matching — works with import aliases and prevents name collisions. Phase 2 of the tsTypeNames deprecation roadmap.
