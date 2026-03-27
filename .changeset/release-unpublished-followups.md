---
"@formspec/build": patch
"@formspec/core": patch
"@formspec/eslint-plugin": patch
---

Release the unpublished follow-up fixes from the spec-parity work.

- `@formspec/build`: restore generation-time IR validation, respect vendor-prefixed deprecation metadata, keep custom constraint validation working for nullable and array-backed extension types, and align description extraction with the documented `@description` > `@remarks` > summary-text precedence.
- `@formspec/core`: include the extension and constraint-definition fixes required by the updated build pipeline.
- `@formspec/eslint-plugin`: fix boolean tag handling so `@uniqueItems` does not require an argument and still participates in type checking, expose plugin metadata consistently for ESLint/doc tooling, and keep generated rule docs in sync with the supported public exports.
