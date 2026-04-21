---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Document `@format` inheritance through `extends` heritage in `docs/002-tsdoc-grammar.md`. The new "Inheritance through `extends` heritage" subsection under `@format` covers the inheritable-kinds allow-list, heritage-clause scope (`extends` yes, `implements` no), the "nearest annotation by BFS wins, ties broken by declaration order" precedence rule, empty-payload non-override semantics, a worked asymmetric-diamond example, and known limitations (derived-side type-alias case tracked in #374; allow-list expansion tracked in #380). No code change.
