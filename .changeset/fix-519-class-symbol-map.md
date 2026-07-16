---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Fix `generateSchemasFromClass` never seeding the symbol map, which silently disabled symbol-based custom-type detection for that entry point. Custom types registered via `defineCustomType<T>()` and resolvable only by symbol (e.g. imported under an alias) now resolve consistently across `generateSchemasFromClass`, `generateSchemasBatch`, and `generateSchemas`. The seeding logic was also extracted into a single shared helper used by all three entry points.
