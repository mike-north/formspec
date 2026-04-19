---
"@formspec/core": minor
"@formspec/build": minor
---

Remove `extractPayload` from `CustomTypeRegistration`. The callback was added in #300 for `Ref<T>` support but is no longer needed — #308 fixes the underlying stack overflow by skipping full expansion of large external type arguments, allowing formspec's existing object resolution and discriminator pipeline to handle `Ref<T>` correctly.
