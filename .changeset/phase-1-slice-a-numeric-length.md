---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Implement numeric + length family argument parsers (Phase 1 Slice A)

Fills in the two `throw throwNotImplemented` sites in tag-argument-parser.ts
for the numeric (`@minimum`, `@maximum`, `@exclusiveMinimum`,
`@exclusiveMaximum`, `@multipleOf`) and length (`@minLength`, `@maxLength`,
`@minItems`, `@maxItems`) constraint-tag families. Pins current behavior
for `Infinity`/`NaN`/non-integer values per §3 of the retirement plan. No
consumer wiring — `tsdoc-parser.ts` and `file-snapshots.ts` keep calling
the synthetic path.
