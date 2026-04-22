---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"@formspec/language-server": patch
"@formspec/ts-plugin": patch
"formspec": patch
---

Fix path-targeted built-in constraint tags so they participate in custom-type broadening. `@exclusiveMinimum :amount 0` on a `MonetaryAmount` field whose `amount` is a registered Decimal now emits the broadened custom-constraint keyword (e.g. `decimalExclusiveMinimum: "0"`) instead of the semantically-invalid raw `exclusiveMinimum: 0` sibling of `$ref`.

Also unblocks path traversal through nullable intermediates at the IR level — `@minimum :money.amount 0` on `LineItem { money: MonetaryAmount | null }` now resolves cleanly, closing an asymmetry with the compiler-backed TS resolver that already stripped nullable unions.

The snapshot consumer used by `@formspec/ts-plugin` and `@formspec/language-server` will receive the same fix in a follow-up (#396); until then, IDE diagnostics for path-targeted constraints on custom types remain unbroadened.
