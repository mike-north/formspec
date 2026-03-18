---
"@formspec/core": minor
"@formspec/decorators": minor
"@formspec/build": minor
"@formspec/cli": minor
"@formspec/eslint-plugin": minor
"formspec": minor
---

Redesign @formspec/decorators as marker-only TC39 Stage 3 decorators

**@formspec/decorators** — Complete rewrite:

- All decorators are now no-ops (zero runtime overhead, marker-only for CLI static analysis)
- Uses TC39 Stage 3 decorator signatures (`ClassFieldDecoratorContext`)
- New decorators: `@Field({ displayName, description?, placeholder?, order? })`, `@Minimum`, `@Maximum`, `@ExclusiveMinimum`, `@ExclusiveMaximum`, `@MinLength`, `@MaxLength`, `@Pattern(RegExp)`
- Extensibility API: `extendDecorator()` to narrow built-ins, `customDecorator()` to create custom markers/parameterized decorators with `x-formspec-*` schema extensions
- Brand types via unique symbols for CLI identification through `.d.ts` files
- Removed: `@Label`, `@Placeholder`, `@Description`, `@Min`, `@Max`, `@Step`, `@MinItems`, `@MaxItems`, `toFormSpec()`, `buildFormSchemas()`, `getDecoratorMetadata()`, `getTypeMetadata()`, and all runtime metadata storage

**@formspec/build** — Analysis pipeline now lives here:

- Moved analyzer, generators, and codegen from `@formspec/cli`
- New high-level `generateSchemasFromClass()` entry point
- Consolidated JSON Schema types: single `JSONSchema7` family with `ExtendedJSONSchema7` for `x-formspec-*` extensions
- Brand detection via TypeScript type checker `getProperties()` (not fragile `typeToString` regex)
- `typescript` is now a peer dependency

**@formspec/cli** — Thin wrapper importing from `@formspec/build`

**@formspec/eslint-plugin** — Updated for new decorator names:

- New rule: `consistent-constraints` (replaces `min-max-valid-range`, adds exclusive bound and conflicting bound checks)
- New rules: `decorator-allowed-field-types`, `prefer-custom-decorator`
- Updated: `decorator-field-type-mismatch`, `no-conflicting-decorators`, `no-duplicate-decorators`
