---
"@formspec/core": minor
"@formspec/build": minor
"@formspec/cli": minor
"@formspec/eslint-plugin": minor
"@formspec/analysis": minor
"@formspec/config": minor
"@formspec/dsl": minor
"@formspec/language-server": minor
"@formspec/runtime": minor
"@formspec/ts-plugin": minor
"formspec": minor
---

Remove `extractPayload` from `CustomTypeRegistration`. The callback was added in #300 for `Ref<T>` support but is no longer needed — #308 fixes the underlying stack overflow by skipping full expansion of large external type arguments, allowing formspec's existing object resolution and discriminator pipeline to handle `Ref<T>` correctly.
