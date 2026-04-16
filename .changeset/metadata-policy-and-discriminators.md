---
"@formspec/core": minor
"@formspec/dsl": minor
"@formspec/build": minor
"formspec": minor
"@formspec/analysis": patch
"@formspec/cli": patch
"@formspec/config": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/runtime": patch
"@formspec/ts-plugin": patch
---

Add metadata policy and resolved metadata support across core, the DSL factory surface, and build generation. JSON Schema and UI Schema now honor resolved `apiName` and `displayName`, mixed-authoring merges metadata by explicit-vs-inferred precedence, and discriminator resolution supports literal identity properties plus metadata-driven names for object-like generic sources.
