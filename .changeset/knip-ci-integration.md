---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Internal refactor: unexport `MethodParamsSchemas` from `@formspec/build/src/generators/method-schema.ts`. The type was never referenced outside its defining module, was not part of the package's public `exports`, and did not appear in any API Extractor report — it is now a module-local interface. No consumer-visible change.
