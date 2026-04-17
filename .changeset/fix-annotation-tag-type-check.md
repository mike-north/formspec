---
"@formspec/analysis": patch
"@formspec/eslint-plugin": patch
---

Fix `tag-type-check` false positive for annotation tags on non-string fields

Annotation tags like `@displayName` accept a string *value* but can annotate fields of any type. Previously, `buildExtraTagDefinition` derived `capabilities` from the tag's value kind, so `@displayName` was assigned `string-like` capability and incorrectly rejected on fields like `MonetaryAmount` or `boolean`.
