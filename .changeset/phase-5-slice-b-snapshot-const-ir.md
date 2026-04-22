---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Snapshot consumer now validates `@const` values against the field type

Closes the IR-validation gap tracked by 4 canaries in
`constraint-canaries.test.ts`. The snapshot consumer now runs
`_checkConstValueAgainstType` in `buildTagDiagnostics` after Role-C
accepts the parsed JSON value, emitting `TYPE_MISMATCH` for primitive
value/type mismatches and non-matching enum members — matching the build
consumer's `semantic-targets.ts` `case "const"` behavior. No behavior
change in the build consumer.
