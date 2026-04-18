---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Fix constraint validation on sibling fields when an interface contains an imported type. Previously, an interface like `{ year: Integer; vin: string }` where `Integer` was imported from another module would be entirely excluded from the synthetic checker's supporting declarations. This caused spurious TYPE_MISMATCH errors on string constraint tags (`@minLength`, `@maxLength`) applied to non-imported sibling fields.

The synthetic program now rewrites imported member types to `unknown` instead of dropping the entire interface, preserving type context for non-imported siblings.
