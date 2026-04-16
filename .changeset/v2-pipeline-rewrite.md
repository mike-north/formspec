---
"@formspec/core": minor
"@formspec/build": minor
"@formspec/cli": minor
"@formspec/eslint-plugin": minor
"@formspec/config": patch
"@formspec/runtime": patch
"formspec": minor
---

Rewrite build pipeline around Canonical IR with constraint validation and extension API

**@formspec/core**

- Add Canonical IR type definitions (`FormIR`, `FieldIR`, `GroupIR`, `ConditionalIR`) and `IR_VERSION` constant
- Add Extension API types (`ExtensionDefinition`, `ExtensionRegistry`)
- Flip `BUILTIN_CONSTRAINT_DEFINITIONS` keys from PascalCase to camelCase (matching JSON Schema keywords)
- Add `normalizeConstraintTagName` and `isBuiltinConstraintName` utilities
- Add `multipleOf`, `minItems`, `maxItems` built-in constraints

**@formspec/build**

- Centralize constraint name normalization (import from `@formspec/core` instead of per-package implementations)
- Add transitive type alias constraint propagation
- Rewrite TSDoc analyzer to produce IR directly (replaces legacy `FormElement` intermediate)
- Add IR → JSON Schema 2020-12 generator with `$defs`/`$ref` support
- Add IR → JSON Forms UI Schema generator
- Wire full pipeline through IR, delete legacy code paths
- Add constraint validator with contradiction detection
- Add extension registry and validator integration
- Add chain DSL and TSDoc parity test suite

**@formspec/cli**

- Add `--emit-ir` flag to output Canonical IR
- Add `--validate-only` flag for schema validation without writing files

**@formspec/eslint-plugin**

- Add constraint rule factory for type-aware constraint validation
- Add `multipleOf`/`minItems`/`maxItems` to type-mismatch and consistent-constraints rules
- Centralize constraint name normalization (import from `@formspec/core`)

**@formspec/playground**

- Add IR viewer and constraint validation panels

**@formspec/constraints**

- Fix constraint propagation through nested class types

**@formspec/runtime**

- Adjust exports after decorator DSL removal

**formspec**

- Update umbrella re-exports for new public API surface
