---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/config": patch
"@formspec/core": patch
"@formspec/dsl": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/runtime": patch
"@formspec/ts-plugin": patch
"@formspec/validator": patch
"formspec": patch
---

Internal restructure: tests moved from `src/__tests__/` to a sibling `tests/` folder in each package, with the TypeScript typecheck scope widened to cover them. No public API changes.
