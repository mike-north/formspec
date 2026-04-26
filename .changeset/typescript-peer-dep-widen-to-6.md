---
"@formspec/analysis": minor
"@formspec/build": minor
"@formspec/eslint-plugin": minor
"@formspec/language-server": minor
"@formspec/ts-plugin": minor
"formspec": minor
---

Widen the `typescript` peer-dep range from `^5.9.3` to `>=5.7.3 <7`. FormSpec now officially supports TypeScript 5.7 through 6.x. The `<7` upper bound is deliberate — TypeScript 7.x is the Go rewrite with a substantively different API surface, and that migration will be handled separately. The 5.7 floor reflects the lowest version where the workspace's full toolchain (build, typecheck, test, lint) passes end-to-end; build/test alone work down to 5.5, but `@typescript-eslint/parser` 8.x's project-service mode misbehaves below 5.7.

`@formspec/language-server` and `formspec` (the umbrella) inherit this support transitively through their dependencies on `@formspec/analysis` and `@formspec/build` respectively.
