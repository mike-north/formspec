---
"@formspec/build": minor
"@formspec/cli": minor
---

Align generated object and type-mapping schemas with the current spec. Ordinary
object schemas now omit `additionalProperties: false` by default, while
nullable unions, named type `$defs`/`$ref` usage, and unconstrained
`Record<string, T>` mappings are covered and preserved by normative end-to-end
tests.
