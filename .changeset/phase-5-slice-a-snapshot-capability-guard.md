---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Port host-checker capability guard + placement pre-check to snapshot consumer

Closes 8 Role-B silent-acceptance bugs tracked in #326. The snapshot consumer
now runs the same `_supportsConstraintCapability` and `getMatchingTagSignatures`
checks the build consumer already used, emitting `TYPE_MISMATCH` and
`INVALID_TAG_PLACEMENT` at the same correctness boundary. Prerequisite for
Phase 5C deletion of the synthetic machinery.
