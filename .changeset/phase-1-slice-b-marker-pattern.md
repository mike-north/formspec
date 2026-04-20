---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Implement boolean-marker + string-opaque family argument parsers (Phase 1 Slice B)

Fills in the `throw throwNotImplemented` sites in tag-argument-parser.ts
for `@uniqueItems` (boolean-marker) and `@pattern` (string-opaque).
Preserves current opaque-string behavior for `@pattern` (no regex
compilation) per §6 risk 2 of the retirement plan. No consumer wiring.
