---
"@formspec/core": patch
"@formspec/build": patch
---

Fix prototype pollution vulnerability in `isBuiltinConstraintName`: guard now uses `Object.hasOwn()` instead of the `in` operator, preventing `__proto__` and inherited properties from being treated as valid constraint names
