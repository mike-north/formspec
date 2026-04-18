---
"@formspec/build": patch
---

Fix TYPE_MISMATCH false positives for numeric constraint tags (`@minimum`, `@maximum`, etc.) on integer-branded types imported from another module.

Previously, when a type structurally matching `number & { [__integerBrand]: true }` (e.g. `Integer` or `PositiveInteger` from `@stripe/extensibility-sdk/stdlib`) was imported from an external module, the compiler-backed constraint validator rejected it as a capability mismatch because the synthetic TypeScript program used for validation could not resolve the imported type name.

The private `isIntegerBrandedType` function in `class-analyzer.ts` is now exported from `ts-type-utils.ts` and shared with `tsdoc-parser.ts`, which uses it to bypass the synthetic check for integer-branded types — consistent with how the IR classification path already treats them.
