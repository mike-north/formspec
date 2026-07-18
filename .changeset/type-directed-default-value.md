---
"@formspec/analysis": patch
"@formspec/build": patch
"formspec": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
---

Fix `@defaultValue` parsing so it is type-directed against the field's resolved target type (spec 002 §3.2), instead of guessing a JSON literal independent of the field's type.

Previously, `@defaultValue 6` on a `string` field emitted `{"type":"string","default":6}` — a `default` that fails validation against its own generated subschema. Now:

- Unquoted values are coerced to a non-string interpretation permitted by the field's type first (`@defaultValue 6` on a `number` field → `default: 6`), and fall back to the raw text as a string only when the field's type actually accepts a string (`@defaultValue 6` on a `string` field → `default: "6"`).
- A quoted JSON string (`@defaultValue "6"`) is always an explicit string, even when the field's type also permits a number.
- When no interpretation fits the field's type at all (e.g. `@defaultValue pending` on a `number` field), generation now reports a `DEFAULT_VALUE_TYPE_MISMATCH` diagnostic instead of silently emitting a mismatched `default`.

Scope notes: the type-directed parse applies to built-in primitive target types
(`string`/`number`/`boolean`/nullable unions of those); object, array,
reference, enum/literal-union, and custom target types fall back to the
previous untyped parsing (issues #360, #517 non-goals). The IDE/LSP snapshot
path does not yet thread field types into `@defaultValue` parsing, so editor
tooling may still display the untyped interpretation until the snapshot-side
type resolution (issue #396) lands. Custom-type `@defaultValue` coercion
(issue #360) is unaffected.
