---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/config": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"formspec": patch
---

Fix two pattern-matching semantics gaps in `@formspec/config`'s `packages` override resolution:

- A pattern-leading `**/` in a `packages` glob (e.g. `"**/forms.ts"`) now matches zero directories, so it applies to top-level files as well as nested ones, matching standard glob semantics. Previously `"**/forms.ts"` required at least one directory separator and silently never matched a root-level `forms.ts`.
- `vendorPrefix` validation now accepts multi-segment prefixes (`"x-acme-corp"`, `"x-stripe-billing"`), matching the OpenAPI/JSON-Schema `x-<vendor>-*` convention and PP10's white-labeling example. The same widened rule is applied in `@formspec/build`'s schema-generation-time `vendorPrefix` validation so a prefix accepted at config load time doesn't fail later during `generateSchemas`.
