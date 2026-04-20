---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Wire typed argument parser into the build consumer (Phase 2)

Calls `parseTagArgument` inside `buildCompilerBackedConstraintDiagnostics`
(tsdoc-parser.ts) so Role-C argument-literal validation runs before the
synthetic TypeScript checker. Invalid arguments (hex literals, non-array
`@enumOptions`, etc.) now produce `INVALID_TAG_ARGUMENT` diagnostics from
the typed parser rather than `TYPE_MISMATCH` from the synthetic checker.

Also normalises the `@minimum Infinity` / `@minimum NaN` build/snapshot
divergence (§3): `renderSyntheticArgumentExpression` now passes these
values through as TypeScript identifiers instead of JSON-quoted strings,
so both consumers accept them without producing a diagnostic. Exports
`parseTagArgument` and friends from `@formspec/analysis/internal` and
adds `getTypedParserLogger` to the constraint-validator-logger surface.
