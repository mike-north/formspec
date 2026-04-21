---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Strengthen NoTruncation regression coverage with anonymous-intersection case

Follow-up to PR #357. The prior `LongIntersection` test used a named alias —
TypeScript's `typeToString` renders those identically with or without
`NoTruncation`, so the test passed pre- and post-fix, providing zero regression
coverage. This adds an anonymous-intersection fixture (276 chars `NoTruncation`
vs 228 chars default — structurally different) that actually demonstrates the
fix. Verified by reverting the fix locally: the new test fails as expected.

Also clarifies the null-guard comment in `hasExtensionBroadening` and softens
the specific character-count claim (the truncation threshold varies by type
structure).
