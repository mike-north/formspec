---
"@formspec/build": patch
---

Emit `$ref` with sibling keywords instead of `allOf` composition when field-level constraints are applied to `$ref`-based types. Produces cleaner JSON Schema 2020-12 output compatible with renderers that don't support `allOf` (e.g., the Stripe dashboard config UI).
