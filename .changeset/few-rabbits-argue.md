---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Tighten the white-label tooling surface by fixing protocol-type exports,
preserving canonical diagnostic categories in the LSP adapter, and avoiding
lingering refresh timers in direct semantic-service hosts.
