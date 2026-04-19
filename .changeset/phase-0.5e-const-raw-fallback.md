---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Add edge-case behavior-pin tests for `@const` raw-string fallback (Phase 0.5e). Covers invalid number-like input, multi-line JSON truncation, trailing-comma arrays, Unicode escape sequences, and empty-after-trim payloads.
