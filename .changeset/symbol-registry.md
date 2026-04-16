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

Add `defineCustomType<T>()` type parameter extraction for symbol-based custom type detection. When a config file uses type parameters, the build pipeline resolves them to ts.Symbol for O(1 identity-based lookup during field analysis — immune to import aliases and name collisions. Mark `tsTypeNames` as deprecated. Phase 3 of the tsTypeNames deprecation roadmap.
