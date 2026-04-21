---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Clarify the precedence rule documented in the heritage-annotation inheritance tests: the actual rule is "nearest annotation by BFS wins, with ties broken by declaration order in the `extends` clause", not "first-listed `extends` wins in every case". Adds an asymmetric-diamond (Case D) regression test pinning the behavior so a future refactor cannot silently flip resolution. No emitter behavior changes.
