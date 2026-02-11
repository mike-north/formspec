# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages (must build before running tests)
pnpm run build

# Run all tests across packages
pnpm run test

# Run tests in a specific package
pnpm --filter @formspec/dsl run test

# Run tests in watch mode (in a package directory)
cd packages/dsl && pnpm vitest

# Type checking
pnpm run typecheck

# Linting
pnpm run lint
pnpm run lint:fix

# Formatting
pnpm run format:check
pnpm run format

# API Extractor (validate public API surface)
pnpm run api-extractor        # CI mode - fails on changes
pnpm run api-extractor:local  # Dev mode - updates report files
```

## Architecture Overview

FormSpec is a TypeScript monorepo for defining type-safe forms that compile to JSON Schema and JSON Forms UI Schema.

### Package Dependency Graph

```
formspec (main entry point - re-exports everything)
    ├── @formspec/core     (type definitions: FormElement, Field types, etc.)
    ├── @formspec/dsl      (builder functions: field.*, group, when, formspec)
    ├── @formspec/build    (schema generators: buildFormSchemas, generateJsonSchema)
    └── @formspec/runtime  (resolver helpers: defineResolvers)

@formspec/decorators       (alternative decorator-based DSL)
@formspec/cli              (codegen CLI for decorator DSL)
@formspec/eslint-plugin    (ESLint rules for FormSpec)
@formspec/constraints      (constraint validation and enforcement)
```

### Key Concepts

1. **Two DSLs**: Chain DSL (primary) uses builder functions; Decorator DSL uses TypeScript decorators on classes
2. **Type Inference**: Schema types are inferred from form definitions - use `InferFormSchema<typeof form>`
3. **Groups vs Objects**: `group()` is UI-only organization (flat schema); `field.object()` creates nested data
4. **Conditionals**: `when(is("field", "value"), ...)` controls UI visibility but all fields remain in schema
5. **Dynamic Fields**: `field.dynamicEnum()` for runtime-fetched options; resolver functions defined via `defineResolvers()`

### Build Order

Packages must build in dependency order. The root `pnpm run build` handles this automatically. For manual builds:
1. `@formspec/core` (no deps)
2. `@formspec/dsl` (depends on core)
3. `@formspec/build`, `@formspec/runtime` (depend on core)
4. `formspec` (depends on all above)

## Testing

- **Runtime tests**: Vitest - `pnpm --filter @formspec/dsl run test`
- **Type tests**: tsd - `pnpm --filter @formspec/dsl run test:types`
- Type test files go in `src/__tests__/*.test-d.ts`

## Releasing

Uses Changesets for versioning. All `@formspec/*` packages are version-linked.

```bash
pnpm changeset              # Add a changeset for your changes
pnpm run version            # Apply changesets (CI usually does this)
pnpm run release            # Build and publish (CI usually does this)
```

## Code Conventions

- Use `as const` on enum option arrays: `field.enum("status", ["draft", "sent"] as const)`
- Prefix unused variables with underscore: `const _unused = ...`
- No `esModuleInterop` or `allowSyntheticDefaultImports` in tsconfig (library compatibility)
