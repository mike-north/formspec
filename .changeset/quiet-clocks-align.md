---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/config": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"formspec": patch
---

Extract shared Chain DSL policy types, defaults, and validators into the private internal `@formspec/dsl-policy` package while preserving compatibility re-exports from `@formspec/config`.
