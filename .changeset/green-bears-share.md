---
"@formspec/analysis": minor
"@formspec/build": minor
"@formspec/cli": minor
"@formspec/config": minor
"@formspec/core": minor
"@formspec/dsl": minor
"@formspec/eslint-plugin": minor
"@formspec/language-server": minor
"@formspec/runtime": minor
"@formspec/ts-plugin": minor
"@formspec/validator": minor
"formspec": minor
---

Generate API Extractor declaration rollups for the public, beta, alpha, and untrimmed internal release-tag surfaces, and emit matching API report variants for each package.

The package root `types` entries continue to point at the public rollups, while the additional rollups now exist as build artifacts for tooling, monorepo validation, and future subpath exposure.
