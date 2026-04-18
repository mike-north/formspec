---
"@formspec/build": patch
"@formspec/analysis": patch
---

Fix TYPE_MISMATCH false positives for numeric constraint tags (`@minimum`, `@maximum`, etc.) on integer-branded types imported from another module, including nullable (`Integer | null`) and optional (`score?: Integer`) variants.

Two independent validation layers needed fixes:

1. **`tsdoc-parser.ts`** (compiler-backed constraint validation): The synthetic TypeScript program used for validation couldn't resolve imported type names. The `isIntegerBrandedType` bypass now strips nullish unions before checking, so `Integer | null` is handled correctly.

2. **`semantic-targets.ts`** (IR-level constraint validation): `checkConstraintOnType` checked capabilities against the raw `effectiveType`, which is a `union` IR node for nullable fields. Now unwraps nullable unions to the non-null member before computing type capabilities.
