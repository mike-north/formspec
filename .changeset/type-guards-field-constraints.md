---
"@formspec/core": minor
"@formspec/build": minor
"formspec": minor
---

Add type guards for FormElement subtypes and string/number field constraints

- Export 11 type guard functions (isTextField, isNumberField, etc.) from @formspec/core
- Add minLength, maxLength, pattern to TextField; multipleOf to NumberField; params to DynamicSchemaField
- Wire new constraints through chain DSL canonicalizer to FormIR
- Re-export type guards from formspec umbrella package
