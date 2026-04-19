---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Fix stack overflow when a generic type's type argument references a large external type (e.g., `Ref<Stripe.Customer>` where `Customer` has 100+ nested properties). Type arguments from external modules are now emitted as opaque references instead of being recursively expanded, since they are only used for `$defs` naming and don't contribute to the schema output.
