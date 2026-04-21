---
"@formspec/analysis": patch
"@formspec/build": patch
"formspec": patch
---

Fix path-targeted built-in constraint tags so they participate in custom-type broadening. `@exclusiveMinimum :amount 0` on a `MonetaryAmount` field whose `amount` is a registered Decimal now emits the broadened custom-constraint keyword (e.g. `decimalExclusiveMinimum: "0"`) instead of the semantically-invalid raw `exclusiveMinimum: 0` sibling of `$ref`.

Also unblocks path traversal through nullable intermediates at the IR level — `@minimum :money.amount 0` on `LineItem { money: MonetaryAmount | null }` now resolves cleanly, closing an asymmetry with the compiler-backed TS resolver that already stripped nullable unions.
