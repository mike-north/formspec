---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Fix optional shared type aliases not being deduplicated into `$defs`

Named string-union enum types used as optional properties (`currency?: Currency`) were being
inlined at every usage site instead of being placed in `$defs` and referenced via `$ref`.
The same issue also affected optional properties that referenced shared non-generic object-shape
aliases.

Root cause: TypeScript synthesizes `T | undefined` for optional properties, and the synthesized
type can lose the `aliasSymbol` from the original alias. The class-analyzer relied on
`aliasSymbol` to register named types in the `typeRegistry`, so affected optional fields were
never registered and were inlined instead.

Fix: when `aliasSymbol` is absent on a synthesized optional-property type, fall back to
inspecting the source node's type annotation via `getReferencedTypeAliasDeclaration`. If the
annotation references a supported type alias, the alias name and declaration are recovered and
used to register the type normally in the `typeRegistry`. This recovery now applies to union
aliases and non-generic object-shape aliases, while still excluding generic aliases and
primitive/branded aliases.

This prevents generated schemas from ballooning in size when large enum types (e.g. 157 ISO
4217 currency codes) are used as optional properties across multiple fields, and also means
optional shared object aliases are deduplicated into `$defs` instead of being repeatedly inlined.
