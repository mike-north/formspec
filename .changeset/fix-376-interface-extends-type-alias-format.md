---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Fix `@format` inheritance when an interface (or class) `extends` a type-alias base. The BFS walker in `collectInheritedTypeAnnotations` previously enqueued only `ClassDeclaration` and `InterfaceDeclaration` bases, silently dropping any `TypeAliasDeclaration` base whose resolved type is object-shaped. The walker now also traverses type-alias bases, extracting JSDoc annotations from them and, when the alias's RHS is a named type, continuing up the heritage chain through the alias.
