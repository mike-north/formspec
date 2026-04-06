---
"@formspec/build": minor
"@formspec/cli": patch
"formspec": patch
---

Add a supported static build context API for compiler-backed export discovery,
and support generating schemas from resolved declarations, method parameters,
method return types, and other discovered TypeScript types without importing
`@formspec/build/internals`.
