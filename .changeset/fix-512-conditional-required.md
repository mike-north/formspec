---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/dsl": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Fix required fields inside a top-level `when()` conditional being added to the JSON Schema root `required` array. Conditional fields are always present in the schema but are now correctly optional, matching the inferred TypeScript type (where conditional fields are optional). Data valid against the inferred type is now valid against the generated schema when a condition is not met. Also clarifies that a field's `required` option affects only JSON Schema validation, not inferred-type optionality, which is driven by conditional membership.
