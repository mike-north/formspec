---
"@formspec/build": minor
"@formspec/cli": minor
---

Support recursive named types in canonical IR generation and JSON Schema
emission, including circular class/interface references and recursive
`$defs`/`$ref` output.

This also fixes a regression where named non-recursive record aliases could be
lifted into `$defs` instead of staying inline as record schemas.
