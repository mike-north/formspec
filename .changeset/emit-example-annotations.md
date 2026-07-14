---
"@formspec/core": minor
"@formspec/build": minor
"formspec": minor
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

`@example` remains a TSDoc-surface-only annotation; the chain DSL has no
`examples` option (documented as a parity exception in spec 006).
