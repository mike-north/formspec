---
"formspec": patch
"@formspec/core": patch
"@formspec/build": patch
"@formspec/runtime": patch
"@formspec/dsl": patch
"@formspec/decorators": patch
"@formspec/cli": patch
---

Add README.md documentation to all npm packages

- Added comprehensive README.md files to formspec, @formspec/core, @formspec/build, and @formspec/runtime
- Added ESM requirements section to all package READMEs
- Updated package.json files to include README.md in published packages

This addresses DX evaluation feedback that published packages lacked documentation,
making it difficult for new users to get started.
