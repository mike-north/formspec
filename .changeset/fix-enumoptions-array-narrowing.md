---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Tighten Array.isArray narrowing in parseEnumOptionsArgument (#345)

Re-bind to `unknown[]` after `Array.isArray` so the `isJsonValue`
predicate narrows soundly to `JsonValue[]` rather than relying on the
`any` escape hatch. No behavior change.
