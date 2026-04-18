---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Internal: add regression tests covering the synthetic `__result` wrapper rename under an inferring field-level `apiName` metadata policy (guards the fix in `@formspec/build`'s `toStandaloneJsonSchema`).
