---
"@formspec/core": patch
"@formspec/dsl": patch
"@formspec/build": patch
"@formspec/runtime": patch
"@formspec/constraints": patch
"@formspec/eslint-plugin": patch
"@formspec/cli": patch
"formspec": patch
---

Add dual CJS/ESM builds via tsup and API Extractor for all published packages

All published packages now ship both ESM (.js) and CJS (.cjs) output, built by tsup. API Extractor generates rolled-up .d.ts declaration files for all 9 packages (previously missing for @formspec/decorators and @formspec/cli).
