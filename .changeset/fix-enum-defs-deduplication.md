---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Fix optional enum properties not being deduplicated into `$defs`

Named string-union enum types used as optional properties (`currency?: Currency`) were being
inlined at every usage site instead of being placed in `$defs` and referenced via `$ref`.

Root cause: TypeScript synthesizes `Currency | undefined` for optional properties, and the
synthesized union loses the `aliasSymbol` from the original `Currency` alias. The class-analyzer
relied on `aliasSymbol` to register named types in the `typeRegistry`, so optional enum fields
were never registered and were inlined instead.

Fix: when `aliasSymbol` is absent on a union type, fall back to inspecting the source node's
type annotation via `getReferencedTypeAliasDeclaration`. If the annotation is a reference to a
type alias whose underlying type is a union, the alias name and declaration are recovered and
used to register the type normally in the `typeRegistry`.

This prevents generated schemas from ballooning in size when large enum types (e.g. 157 ISO
4217 currency codes) are used as optional properties across multiple fields.
