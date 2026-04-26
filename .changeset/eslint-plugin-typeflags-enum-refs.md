---
"@formspec/eslint-plugin": patch
---

Fix `@formspec/eslint-plugin` rules under TypeScript 6.x by replacing hardcoded `ts.TypeFlags` numeric literals in the type-classification helpers with `ts.TypeFlags.X` enum references. TS 6 renumbered the entire `TypeFlags` enum, which caused `isStringType`, `isNumberType`, `isBooleanType`, `isNullableType`, and `getFieldTypeCategory` to produce wrong results (e.g. reporting `nonStringLikeTargetField` instead of `nullableTargetField` for `string | null`). Behavior under TS 5.x is unchanged.
