---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/config": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
---

Add serialization config plumbing and centralize FormSpec JSON Schema vendor-key emission. Dynamic source output no longer emits the legacy keys `x-formspec-source`, `x-formspec-params`, or `x-formspec-schemaSource`; it now emits the spec-conformant `x-formspec-option-source`, `x-formspec-option-source-params`, and `x-formspec-schema-source` keys.
