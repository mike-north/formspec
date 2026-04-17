---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Fix `tag-type-check` false positive for annotation tags on non-string fields

Annotation tags like `@displayName` accept a string *value* but can annotate fields of any type. Previously, `buildExtraTagDefinition` derived `capabilities` from the tag's value kind, so `@displayName` was assigned `string-like` capability and incorrectly rejected on fields like `MonetaryAmount` or `boolean`.
