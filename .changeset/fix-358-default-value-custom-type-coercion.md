---
"@formspec/build": patch
"@formspec/core": patch
"@formspec/analysis": patch
"@formspec/cli": patch
"@formspec/config": patch
"@formspec/dsl": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/runtime": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Fix `@defaultValue` on custom-type fields emitting a value whose runtime type does not conform to the field's JSON Schema type.

For example, `@defaultValue 9.99` on a `Decimal` field (which maps to `{ type: "string" }`) previously produced `{ "default": 9.99 }` — a numeric default on a string-typed schema. The build pipeline now coerces the parsed literal through the custom-type registration before emitting it as the JSON Schema `default` keyword.

Coercion strategy (in priority order):

1. **Explicit hook**: if the `CustomTypeRegistration` provides a `serializeDefault` function, it is called with the parsed literal and the type payload. Extensions needing bespoke serialization (e.g., Date → ISO-8601 string) should use this hook.
2. **Inference fallback**: when no `serializeDefault` hook is present, the pipeline inspects the `type` keyword on the custom type's emitted JSON Schema. If the emitted type is `"string"` and the parsed literal is a `number`, `boolean`, or `bigint`, it is coerced to its string form. Non-finite numbers (`NaN`, `±Infinity`) are passed through unchanged. Other literal shapes (including objects and arrays) are left unchanged unless an explicit `serializeDefault` hook handles them.
3. **Pass-through**: non-custom types are unaffected; custom types without a matching registration are also passed through unchanged, as are literals not covered by the inference fallback.
