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

Raise the `typescript` minimum from `^5.7.3` to `^5.9.3` across every workspace package (peer, runtime, and dev dependencies) so packages advertise the latest stable TypeScript 5.x as their supported baseline.

Consumer-visible:

- `@formspec/analysis`, `@formspec/build`, `@formspec/eslint-plugin`, `@formspec/ts-plugin`: `typescript` peer dependency raised to `^5.9.3`.
- `@formspec/cli`: `typescript` runtime dependency raised to `^5.9.3`.

Consumers already on TypeScript 5.9 are unaffected. Consumers on older ranges will see a peer-dependency warning and should upgrade.
