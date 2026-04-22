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
"@formspec/validator": patch
"formspec": patch
---

Tighten external-dependency minimums so every package advertises the version it's actually built against, and align internal devDependencies across the workspace.

Consumer-visible:

- `@formspec/analysis`, `@formspec/build`, `@formspec/eslint-plugin`, `@formspec/ts-plugin`: `typescript` peer dependency raised from `^5.0.0` to `^5.7.3`.
- `@formspec/cli`: `typescript` runtime dependency raised from `^5.0.0` to `^5.7.3`.
- `@formspec/eslint-plugin`: `eslint` peer dependency raised from `^9.0.0` to `^9.39.2`.

Internal only (devDependencies): `vitest` aligned to `^3.2.4` across all packages; `@microsoft/api-extractor` upgraded to `^7.58.7` (latest 7.x, now bundling TypeScript 5.9.3).

Consumers already on TypeScript 5.7+ and ESLint 9.39+ are unaffected. Consumers on older ranges will see a peer-dependency warning and should upgrade.
