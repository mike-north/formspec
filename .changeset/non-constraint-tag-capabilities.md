---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Fix spurious field-type rejections for non-constraint tags across all non-constraint categories.

Tags like `@displayName`, `@group`, `@example`, `@remarks`, and `@see` accept a typed argument (usually a string) but describe or decorate a declaration — they are not field-type constraints. `buildExtraTagDefinition` previously derived `capabilities` from the tag's value-kind, so every one of these tags inherited a stray field-type requirement (e.g., `@displayName` → `["string-like"]`), which the `tag-type-check` ESLint rule and the narrow synthetic applicability check both surfaced as a rejection on non-matching fields (objects, numbers, booleans, branded `Integer`, etc.).

`buildExtraTagDefinition` now emits `capabilities: []` for every non-constraint category (`annotation`, `structure`, `ecosystem`) — only `constraint`-category tags (the built-ins in `BUILTIN_TAG_DEFINITIONS`) carry a field-type capability. `buildExtensionMetadataTagDefinition` is aligned to the same invariant.

Affected tags that previously produced false positives: `@displayName`, `@description`, `@format`, `@placeholder`, `@order`, `@apiName`, `@group`, `@example`, `@remarks`, `@see`.
