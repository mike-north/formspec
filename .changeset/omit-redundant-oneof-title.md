---
"@formspec/build": patch
---

Omit redundant `title` in `oneOf` enum serialization when title equals the `const` value.

When using `enumSerialization: "oneOf"`, members with no `@displayName` (or a `@displayName` identical to the value) previously emitted `{ "const": "USD", "title": "USD" }`. The `title` is now omitted in those cases, producing the more compact `{ "const": "USD" }`. A `title` is still emitted when an explicit `@displayName` differs from the value (e.g. `{ "const": "EUR", "title": "Euro" }`).

This reduces serialized schema size significantly for large enums — approximately 13 characters saved per member (~2,000 characters for a 157-member ISO 4217 currency enum).
