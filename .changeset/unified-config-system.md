---
"@formspec/config": minor
"@formspec/build": minor
"@formspec/eslint-plugin": minor
"@formspec/cli": minor
"@formspec/language-server": minor
"@formspec/analysis": patch
"@formspec/dsl": patch
"@formspec/runtime": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Introduce unified `FormSpecConfig` system. Rename `@formspec/constraints` to `@formspec/config`. All consumers (build, CLI, ESLint, language server) now accept a `FormSpecConfig` object carrying extensions, constraints, metadata, vendor prefix, and enum serialization. Adds `defineFormSpecConfig` identity function, `loadFormSpecConfig` with jiti-based TypeScript config file loading, `resolveConfigForFile` for monorepo per-package overrides, and `withConfig()` factory on the ESLint plugin. Removes the outdated playground package. See docs/007-configuration.md for the full spec.
