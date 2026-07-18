---
"@formspec/eslint-plugin": patch
---

Fix `createConstraintRule` factory to visit interface property signatures and type-alias members, not just class properties. Previously, rules built with the factory silently skipped `@Tag` annotations on `interface` fields and `type` alias members, unlike built-in rules which cover the full declaration set via `createDeclarationVisitor`.
