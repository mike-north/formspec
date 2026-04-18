---
"@formspec/analysis": patch
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Fix TYPE_MISMATCH false positives for path-targeted constraints on any extension-registered custom type, and consolidate duplicated custom-type resolution.

- Path-targeted built-in constraint tags (e.g. `@exclusiveMinimum :amount 0`) now defer to the IR-layer validator when the resolved sub-type is an extension-registered custom type with broadening for the tag — previously the compiler-backed validator rejected them as capability mismatches.
- Detection covers all three registration mechanisms: `tsTypeNames` (name), `brand` (structural brand identifiers), and symbol-based registration from `defineCustomType<T>()`. The deferral is tag-aware: only tags with broadening registered on the resolved custom type skip the capability check. Unrelated tags (e.g., `@pattern` on a numeric `Decimal`) still reject via the capability layer.
- The two branches of `buildCompilerBackedConstraintDiagnostics` (path-targeted vs. direct field) are now structurally symmetric — both resolve the type once, check broadening, then run a unified capability check.
- `@formspec/analysis/internal` now exports `stripNullishUnion` — the single source of truth for `T | null`/`T | undefined` collapsing used across the analysis and build layers.
- `class-analyzer.ts`'s private three-resolver chain (`resolveRegisteredCustomType` / `resolveSymbolBasedCustomType` / `resolveBrandedCustomType`) is replaced by a single call to the new shared helper in `@formspec/build/src/extensions/resolve-custom-type.ts`.

No public API changes. The shared helpers are internal to `@formspec/build`.
