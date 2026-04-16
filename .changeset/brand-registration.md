---
"@formspec/core": minor
"@formspec/build": minor
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Add `brand` field to `CustomTypeRegistration` for structural type detection via unique symbol brands. More reliable than `tsTypeNames` string matching — works with import aliases and prevents name collisions. Phase 2 of the tsTypeNames deprecation roadmap.
