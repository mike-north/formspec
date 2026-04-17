---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Export resolveStaticOptions and migrate discovered-schema functions to resolve config internally. Low-level functions (generateSchemasFromDeclaration, generateSchemasFromType, etc.) now support the `config` field on StaticSchemaGenerationOptions, eliminating the need to pass deprecated individual fields.
