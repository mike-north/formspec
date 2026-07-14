---
"@formspec/core": minor
"@formspec/build": minor
"@formspec/analysis": minor
"formspec": minor
"@formspec/cli": patch
"@formspec/config": patch
"@formspec/dsl": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/runtime": patch
"@formspec/ts-plugin": patch
---

Emit `@example` TSDoc tags to JSON Schema `examples`

`@example` tags on type-authored fields now flow through to generated schemas
instead of being silently dropped.

- **@formspec/core:** adds a new `example` annotation kind
  (`ExampleAnnotationNode`) to the canonical IR annotation union. Unlike other
  annotations, `example` is multi-valued: repeated `@example` tags on the same
  field each contribute a distinct node.
- **@formspec/build:** the extractor produces one `example` annotation per
  `@example` tag (JSON-parseable text becomes its JSON value, non-JSON text is
  carried as a string), and JSON Schema generation accumulates them, in source
  order, into the standard `examples` array.
- **@formspec/analysis:** adds a `parseExampleTagValue` helper (JSON-or-string
  parsing per spec 002 §3.2) to the internal API surface.

Downstream packages receive a patch bump for the propagated dependency update.

`@example` remains a TSDoc-surface-only annotation; the chain DSL has no
`examples` option (documented as a parity exception in spec 006).
