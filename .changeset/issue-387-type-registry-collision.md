---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Fail fast when TSDoc schema generation encounters same-named type definitions from different source modules, preventing silent `$defs` collisions.
