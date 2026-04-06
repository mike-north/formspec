---
"@formspec/core": minor
"@formspec/analysis": minor
"@formspec/eslint-plugin": minor
---

Add extensible metadata-analysis APIs for downstream lint tooling. `@formspec/core` now exposes metadata slot registration and richer analysis result/source-mapping types, `@formspec/analysis` exports shared `analyzeMetadataForNode` and `analyzeMetadataForSourceFile` helpers over an existing TypeScript program, and `@formspec/eslint-plugin` / `@formspec/eslint-plugin/base` re-export those helpers for downstream rule authors.
