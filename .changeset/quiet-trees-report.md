---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Emit `ANONYMOUS_RECURSIVE_TYPE` for unsupported anonymous recursive type shapes, fail schema generation with diagnostics for those shapes, and surface the lint rule through the ESLint recommended and strict rule sets. Named recursive `$defs` / `$ref` behavior is unchanged.
