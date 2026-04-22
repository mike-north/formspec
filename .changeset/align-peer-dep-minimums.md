---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Tighten external-dependency minimums so every package advertises the version it's actually built against.

- `@formspec/analysis`, `@formspec/build`, `@formspec/eslint-plugin`, `@formspec/ts-plugin`: `typescript` peer dependency raised from `^5.0.0` to `^5.7.3`.
- `@formspec/cli`: `typescript` runtime dependency raised from `^5.0.0` to `^5.7.3`.
- `@formspec/eslint-plugin`: `eslint` peer dependency raised from `^9.0.0` to `^9.39.2`.

Consumers already on TypeScript 5.7+ and ESLint 9.39+ are unaffected. Consumers on older ranges will see a peer-dependency warning and should upgrade.
