---
"@formspec/build": minor
"formspec": minor
---

Add a mixed-authoring composition API for composing TSDoc-derived models with ChainDSL field overlays.

The new `buildMixedAuthoringSchemas()` entry point keeps the static model authoritative while layering in runtime field metadata such as dynamic option sources.

This also fixes mixed-authoring composition bugs that previously allowed incompatible overlays to silently replace static field types or accept unsupported nested object/array overlays instead of failing loudly.
