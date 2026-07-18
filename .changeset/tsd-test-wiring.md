---
"@formspec/config": patch
"@formspec/dsl": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"formspec": patch
---

`@formspec/dsl` and `@formspec/config` now execute their tsd type tests as part
of `pnpm run test` (matching `@formspec/core`'s pattern), with new negative
(`expectError`) coverage for `InferFormSchema` and the config public surface. A
structural CI guard fails when any workspace package ships `*.test-d.ts` files
whose `test` script does not invoke tsd. No runtime behavior changes.
