---
"@formspec/analysis": minor
"@formspec/build": minor
"@formspec/cli": minor
"@formspec/eslint-plugin": minor
"@formspec/language-server": minor
"@formspec/ts-plugin": minor
"formspec": minor
---

Validate constraint tag values in the build/analysis pipeline

Constraint value-range and format validation previously ran only in the ESLint
plugin, so a build-only consumer could emit invalid JSON Schema with no
diagnostic. Non-finite numerics (`@minimum Infinity`, `@maximum 1e999`, `NaN`),
non-decimal numeric forms (`@minimum 0x10`), negative or fractional lengths
(`@minLength -5`, `@maxItems 2.5`), and uncompilable regex patterns
(`@pattern (`) are now rejected during extraction: each produces no constraint
node plus a structured diagnostic carrying the spec's specific code
(`INVALID_NUMERIC_VALUE`, `INVALID_NON_NEGATIVE_INTEGER`, or
`INVALID_REGEX_PATTERN`). The IR/hover path and the diagnostic path now share a
single validator, so they always agree, and a file containing an invalid
constraint value no longer loses its language-server snapshot after transport.

The ESLint plugin's own value-parsing rules (`valid-numeric-value`,
`valid-integer-value`) are unchanged in this release; consolidating them onto
the same shared validator is tracked separately.
