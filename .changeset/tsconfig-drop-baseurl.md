---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/config": patch
"@formspec/dsl": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/runtime": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Drop the no-op `baseUrl: "."` from each package's build tsconfig and pin `types: ["node"]` at the workspace root. `paths` resolves relative to the tsconfig file when `baseUrl` is omitted (TS 4.1+), so emitted declarations are unchanged. Required for clean builds under TypeScript 6.x, which deprecates `baseUrl` and no longer auto-includes `@types/node` globals.
