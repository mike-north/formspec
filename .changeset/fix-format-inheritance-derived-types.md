---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/config": patch
"@formspec/core": patch
"@formspec/dsl": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/runtime": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Fix type-level `@format` inheritance on derived interfaces and classes (issue #367). When an interface or class extends a base that declares a type-level `@format`, the derived type's `$defs` entry now carries the inherited `format` keyword. Explicit `@format` on the derived type continues to win over the inherited value.
