---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/core": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Release the unpublished follow-up fixes from the spec-parity work.

- `@formspec/build`: restore generation-time IR validation, respect vendor-prefixed deprecation metadata, keep custom constraint validation working for nullable and array-backed extension types, and align description extraction with the documented `@description` > `@remarks` > summary-text precedence.
- `@formspec/cli`: pick up the updated build pipeline behavior through the published CLI entrypoint.
- `@formspec/core`: include the extension and constraint-definition fixes required by the updated build pipeline.
- `@formspec/eslint-plugin`: fix boolean tag handling so `@uniqueItems` does not require an argument and still participates in type checking, expose plugin metadata consistently for ESLint/doc tooling, and keep generated rule docs in sync with the supported public exports.
- `formspec`: pick up the updated build and ESLint-plugin behavior through the umbrella package surface.
