---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Move extension tag-name flattening and settings-bound extension registry reading into `@formspec/analysis`.

The ESLint plugin now uses the shared analysis helpers for extension-registered constraint tags, metadata slots, annotations, and built-in constraint broadening instead of maintaining local `settings.formspec.extensionRegistry` casts.
