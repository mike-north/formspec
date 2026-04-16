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

Document previously undocumented exported APIs and enforce API Extractor's
`ae-undocumented` validation for published package surfaces.

- Add contributor-facing docs for internal exports and external-facing docs for
  alpha-or-better public APIs.
- Enable `ae-undocumented` so newly exported APIs must carry TSDoc before they
  can be released.
