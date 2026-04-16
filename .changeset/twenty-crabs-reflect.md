---
"@formspec/analysis": minor
"@formspec/build": minor
"@formspec/cli": minor
"@formspec/config": minor
"@formspec/core": minor
"@formspec/dsl": minor
"@formspec/eslint-plugin": minor
"@formspec/language-server": minor
"@formspec/ts-plugin": minor
"@formspec/runtime": minor
"formspec": minor
---

Prune the published TypeScript API surface using API Extractor release tags and regenerate API documentation from the trimmed declaration rollups.

This alpha minor intentionally removes several previously root-exported low-level TypeScript APIs so the published surface matches the supported consumer-facing API.

Notable removals include:

- canonical IR and other low-level implementation types from `@formspec/core`
- low-level IR, validator, and analyzer internals from `@formspec/build`
- low-level validator helper/defaults APIs from `@formspec/constraints`

Published consumers should use the stable package-root APIs for supported schema generation flows, including `generateSchemas()`, `generateSchemasFromClass()`, `buildMixedAuthoringSchemas()`, and `createExtensionRegistry()`. Extension authoring remains part of the supported public API. Downstream code using removed low-level root exports should migrate to the stable package-root APIs where possible or, for monorepo-only development, the dedicated internal entrypoints.

Monorepo packages continue to typecheck against untrimmed local declaration rollups during development, while published consumers now see the intentionally curated public surface.
