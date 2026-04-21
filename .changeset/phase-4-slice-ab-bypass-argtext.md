---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Phase 4 Slice A+B — integer-brand bypass parity + shared argument-text extraction

- Closes #325: snapshot consumer now has the same isIntegerBrandedType bypass
  as the build consumer. Build+snapshot fully converge on integer-branded
  types; the KNOWN DIVERGENCE entries from Phase 0.5c are promoted to
  asserted-equal.
- Resolves Copilot review finding from PRs #348 and #354: extracts
  extractEffectiveArgumentText to a shared helper in @formspec/analysis
  (main entry, @internal tag). Both consumers now derive argument text
  identically, correctly handling TAGS_REQUIRING_RAW_TEXT compiler-API
  fallback.

Implements §4 Phase 4 Slice A+B of docs/refactors/synthetic-checker-retirement.md.
