---
"@formspec/build": patch
"@formspec/cli": patch
"@formspec/eslint-plugin": patch
"formspec": patch
---

Fix TYPE_MISMATCH false positives for path-targeted constraints resolving to extension-registered custom types.

Built-in constraint tags like `@exclusiveMinimum` support "broadening" onto custom types (e.g., `Decimal`) registered via extensions. This broadening worked for direct field types but not for path-targeted constraints (`@exclusiveMinimum :amount 0`), because the compiler-backed validation in `buildCompilerBackedConstraintDiagnostics` checked type capabilities using raw `ts.Type` objects that don't understand extension-registered types.

When a path-targeted constraint resolves to a type recognized by the extension registry, the compiler-backed checks now defer to the downstream IR-based analysis in `semantic-targets.ts`, which has full broadening and custom constraint awareness. This mirrors the existing deferral for non-path-targeted broadened types.
