---
"@formspec/analysis": minor
"@formspec/build": minor
"@formspec/eslint-plugin": minor
"@formspec/language-server": minor
"@formspec/ts-plugin": minor
"formspec": minor
---

Widen the `typescript` peer-dep range from `^5.9.3` to `>=5.9.3 <7`. FormSpec now officially supports TypeScript 6.x in addition to 5.9+. The `<7` upper bound is deliberate — TypeScript 7.x is the Go rewrite with a substantively different API surface, and that migration will be handled separately.

`@formspec/language-server` and `formspec` (the umbrella) inherit this support transitively through their dependencies on `@formspec/analysis` and `@formspec/build` respectively.
