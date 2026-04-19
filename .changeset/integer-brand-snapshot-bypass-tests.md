---
"@formspec/analysis": patch
---

Add snapshot-path test coverage for the integer-brand bypass scenarios (phase 0.5c). Mirrors the 7 build-path scenarios from `integer-type.test.ts` through `buildFormSpecAnalysisFileSnapshot`, pinning current divergences with `KNOWN DIVERGENCE` comments so regressions can be detected in either direction.
