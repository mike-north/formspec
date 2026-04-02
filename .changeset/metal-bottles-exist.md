---
"@formspec/analysis": minor
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/constraints": patch
"@formspec/core": patch
"@formspec/dsl": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": minor
"@formspec/runtime": patch
"@formspec/ts-plugin": minor
"formspec": patch
---

Add white-label hybrid tooling composition APIs.

- enrich FormSpec analysis diagnostics with structured category, related-location, and raw data fields for white-label consumers
- refresh generated package reports and metadata so downstream releases include the repaired hybrid-tooling surface
- add public `FormSpecSemanticService` APIs to `@formspec/ts-plugin` so downstream TypeScript hosts can reuse the same `Program`
- add public diagnostics retrieval and LSP conversion helpers to `@formspec/language-server`, with the packaged server acting as the reference implementation
- publish downstream packages with compatible dependency bumps for the new analysis-driven tooling surface
