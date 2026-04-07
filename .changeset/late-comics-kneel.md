---
"@formspec/build": patch
"@formspec/cli": patch
"formspec": patch
---

Fix a stack overflow in discriminator specialization when a generic object-like alias
uses a same-file conditional helper alias for the discriminator field and the bound
type falls back to metadata-derived discriminator values.

- `@formspec/build` now guards primitive alias unwrapping for same-file conditional
  helper aliases so metadata-backed discriminator specialization no longer recurses
  indefinitely.
- Added regression coverage for same-file local helper aliases, same-file inline
  conditional discriminator fields, and the existing cross-file imported-helper
  contrast case.
