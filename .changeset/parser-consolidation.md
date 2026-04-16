---
"@formspec/analysis": minor
"@formspec/build": patch
"@formspec/cli": patch
"formspec": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
---

Consolidate comment parsers on a unified TSDoc-based parser in @formspec/analysis. ESLint scanner and build package delegate to the unified parser instead of maintaining independent tag detection.
