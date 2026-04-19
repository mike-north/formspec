---
"@formspec/core": minor
"@formspec/build": minor
"@formspec/cli": minor
"@formspec/eslint-plugin": minor
"formspec": minor
---

Add optional `resolvePayload` callback to `CustomTypeRegistration`. When defined, the callback is invoked during type analysis with the TypeScript type and checker, and its return value is stored as the custom type node's `payload`. This payload is then passed to `toJsonSchema` during schema generation, enabling extensions to carry type-level information (e.g., a generic argument's resolved literal value) through to JSON Schema output.
