---
"@formspec/core": minor
"@formspec/build": minor
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Add builtin Integer type with `__integerBrand` symbol. Types branded with this symbol produce `{ type: "integer" }` in JSON Schema and accept standard numeric constraints (`@minimum`, `@maximum`, etc.) natively — no extension registration or constraint broadening needed. Re-tighten the vocabulary keyword blocklist now that Integer is handled by the IR pipeline.
