---
"@formspec/eslint-plugin": patch
---

Fix `@formspec/eslint-plugin` type classification so built-in numeric constraint tags accept branded number intersections such as `Integer` and `PositiveInteger`. This prevents false-positive type-mismatch errors for `@minimum`, `@maximum`, `@exclusiveMinimum`, `@exclusiveMaximum`, and `@multipleOf` when those tags are applied to number aliases defined as `number & { ...brand... }`.
