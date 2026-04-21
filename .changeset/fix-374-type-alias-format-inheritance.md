---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Fix `@format` annotation inheritance through type-alias derivation chains (issue #374). When a type alias is derived from another type (`type WorkEmail = BaseEmail`, `type AliasedMonetary = MonetaryAmount`), the derived alias now preserves its own `$defs` identity and inherits `@format` from the base type's declaration chain. Explicit `@format` on the derived alias overrides the inherited value, matching the semantics of interface-extends inheritance from issue #367.
