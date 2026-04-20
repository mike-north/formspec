---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Implement json-array + json-value-with-fallback family argument parsers (Phase 1 Slice C)

Fills in the `throwNotImplemented` sites in `tag-argument-parser.ts` for
`@enumOptions` (JSON array) and `@const` (JSON value with raw-string
fallback). Introduces an `isJsonValue` type guard so element validation
is sound, not a cast. Narrows `JSON.parse` catches to `SyntaxError`.
Preserves heterogeneity in `@enumOptions` and the raw-string fallback
path for `@const` per §1.6 of the retirement plan and Phase 0.5e/0.5f
pinning tests. Includes a pinning test for Issue #327 (parseTagSyntax
newline truncation). No consumer wiring.
