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

Annotation tags like `@displayName` accept a string *value* but can annotate fields of any type. Previously, `buildExtraTagDefinition` and `buildExtensionMetadataTagDefinition` both derived `capabilities` from the tag's value kind, so annotation tags were assigned `string-like` capability and incorrectly rejected on fields like `MonetaryAmount` or `boolean`. Both functions now return empty capabilities for annotation-category tags.
