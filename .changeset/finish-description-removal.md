---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Finish `@description` removal by dropping it from shared tag metadata and adding an autofix that moves unsupported `@description` content into TSDoc summary text.
