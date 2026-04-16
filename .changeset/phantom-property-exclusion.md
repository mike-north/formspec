---
"@formspec/build": patch
"@formspec/cli": patch
"formspec": patch
"@formspec/eslint-plugin": minor
---

Exclude `__`-prefixed phantom properties from schema emission, preventing OOM when resolving types like `Ref<Customer>` with large circular type graphs. Add `no-double-underscore-fields` ESLint rule to warn authors about excluded properties.
