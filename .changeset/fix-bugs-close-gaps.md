---
"@formspec/core": minor
"@formspec/build": minor
"@formspec/cli": minor
"formspec": minor
---

Fix 6 bugs, add TSDoc constraint extraction, $defs/$ref composition, and JSON Schema 2020-12 output

- Fix conditional required leak: fields inside `when()` are no longer in the top-level `required` array
- Fix enum schema: remove redundant `type` alongside `enum`/`oneOf` per JSON Schema spec
- Fix UI Schema: nested object fields emit `Group` layouts with scoped child controls
- Fix CLI enum parity: add `type` consistency between chain DSL and CLI surfaces
- Add `multipleOf` to `NumberField` for integer semantics
- Add string constraints (`minLength`, `maxLength`, `pattern`) to `TextField`
- Add `params` to `DynamicSchemaField`
- Add 11 type guard functions to `@formspec/core` (`isField`, `isTextField`, etc.)
- Add TSDoc comment tag extraction (`@minimum`, `@maxLength`, `@displayName`, `@deprecated`, etc.)
- Add type alias constraint inheritance with `allOf`+`$ref` composition in `$defs`
- Add constraint broadening detection and contradiction validation
- Add type applicability checking (e.g., `@minLength` on `number` produces a diagnostic)
- Add `$defs` name deduplication for generic type collisions
- Upgrade JSON Schema output from draft-07 to 2020-12
- Add `@showWhen`/`@hideWhen` with type-aware value parsing
- Add `@format`, `@order`, `@placeholder`, `@group`, `@maxSigFig`, `@maxDecimalPlaces`, `@remarks`, `@example` tags
