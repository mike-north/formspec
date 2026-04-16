---
"@formspec/core": minor
"@formspec/build": minor
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Add `brand` field to `CustomTypeRegistration` for structural type detection via unique symbol brands. More reliable than `tsTypeNames` for aliased branded types because it does not depend on the local type name. Phase 2 of the tsTypeNames deprecation roadmap.
