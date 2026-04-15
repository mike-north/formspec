---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/constraints": patch
"@formspec/dsl": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/runtime": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Fix TYPE_MISMATCH false positive when built-in numeric constraints (`@minimum`, `@maximum`, `@exclusiveMinimum`, `@exclusiveMaximum`, `@multipleOf`) are applied to custom types that register `builtinConstraintBroadenings`. The validator now consults the extension registry before rejecting constraints on non-numeric types.
