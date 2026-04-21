---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/config": patch
"@formspec/dsl": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/runtime": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Fix unnecessary `allOf` composition when field-level constraints or annotations are applied to `$ref`-based types. JSON Schema 2020-12 (§10.2.1) allows sibling keywords next to `$ref`, so the generator now emits `{ "$ref": "#/$defs/X", "properties": {...} }` directly instead of wrapping in `allOf`. This preserves `$defs` deduplication and produces output that downstream renderers can consume without needing to unwrap `allOf` as a workaround.
