---
"@formspec/core": minor
"@formspec/build": minor
"formspec": minor
"@formspec/language-server": patch
"@formspec/analysis": patch
---

Prune public API surface and promote Zod validation schemas

Move extension authoring types, mixed authoring generator, and implementation-detail types from `@public` to `@internal`. Promote `jsonSchema7Schema`, `uiSchemaSchema`, and the JSON Schema 7 type family to `@public` on the main `@formspec/build` entry point.
