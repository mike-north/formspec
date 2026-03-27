"@formspec/build": patch
"@formspec/core": patch
"@formspec/eslint-plugin": patch
---

Release the unpublished follow-up fixes from the spec-parity work.

- `@formspec/build`: restore generation-time IR validation, respect vendor-prefixed deprecation metadata, and keep custom constraint validation working for nullable and array-backed extension types.
- `@formspec/core`: include the extension and constraint-definition fixes required by the updated build pipeline.
- `@formspec/eslint-plugin`: fix boolean tag handling so `@uniqueItems` does not require an argument and still participates in type checking.
