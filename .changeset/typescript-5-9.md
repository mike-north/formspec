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

Raise the `typescript` minimum from `^5.7.3` to `^5.9.3` for the workspace packages that declare a `typescript` peer or runtime dependency, so those packages advertise TypeScript 5.9 as their supported baseline. The other packages listed in this changeset receive a patch bump because they are part of the repo's linked version group.

Consumer-visible:

- `@formspec/analysis`, `@formspec/build`, `@formspec/eslint-plugin`, `@formspec/ts-plugin`: `typescript` peer dependency raised to `^5.9.3`.
- `@formspec/cli`: `typescript` runtime dependency raised to `^5.9.3`.
- `@formspec/config`, `@formspec/dsl`, `@formspec/language-server`, `@formspec/runtime`, `@formspec/validator`, and `formspec`: patch bumps only, with no direct `typescript` dependency range change in this changeset.

Consumers already on TypeScript 5.9 are unaffected. Consumers on older ranges will see a peer-dependency warning and should upgrade where applicable.
