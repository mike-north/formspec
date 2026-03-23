# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages (must build before running tests)
pnpm run build

# Clean all build artifacts
pnpm run clean

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

FormSpec is a TypeScript monorepo for defining type-safe forms that compile to JSON Schema and JSON Forms UI Schema. See [ARCHITECTURE.md](./ARCHITECTURE.md) for comprehensive documentation.

### Package Dependency Graph

```
formspec (umbrella — re-exports everything)
    ├── @formspec/core     (shared type definitions: FormElement, Field types, etc.)
    ├── @formspec/dsl      (chain DSL builder functions: field.*, group, when, formspec)
    ├── @formspec/build    (schema generators + static analysis pipeline)
    └── @formspec/runtime  (resolver helpers: defineResolvers)

@formspec/cli              (CLI tool — depends on @formspec/build/internals)
@formspec/eslint-plugin    (ESLint rules — depends on @formspec/constraints, @formspec/core)
@formspec/constraints      (constraint validation — depends on @formspec/core)
@formspec/playground       (interactive browser editor — private, depends on all)
```

### Key Concepts

1. **Two authoring paths**: Chain DSL (primary) uses builder functions; Class/Interface Analysis reads TypeScript class and interface definitions via static AST analysis
2. **Type Inference**: Schema types are inferred from form definitions — use `InferFormSchema<typeof form>`
3. **Groups vs Objects**: `group()` is UI-only organization (flat schema); `field.object()` creates nested data
4. **Conditionals**: `when(is("field", "value"), ...)` controls UI visibility but all fields remain in schema
5. **Dynamic Fields**: `field.dynamicEnum()` for runtime-fetched options; resolver functions defined via `defineResolvers()`
6. **Class Constraints**: Decorators and JSDoc tags (`/** @Minimum 0 */`) both produce constraints on class/interface fields; they propagate through nested types

### Build Order

Packages must build in dependency order. The root `pnpm run build` handles this automatically. For manual builds:

1. `@formspec/core` (no deps)
2. `@formspec/dsl`, `@formspec/runtime`, `@formspec/constraints` (depend on core)
3. `@formspec/build` (depends on core; peer dep on typescript)
4. `@formspec/cli`, `@formspec/eslint-plugin` (depend on build/constraints)
5. `formspec` (umbrella, depends on all above)

### Entry Points

`@formspec/build` has three entry points:

- `@formspec/build` — Public API: `buildFormSchemas`, `writeSchemas`, `generateSchemasFromClass`
- `@formspec/build/browser` — Browser-safe subset (no Node.js fs/path)
- `@formspec/build/internals` — Unstable internal APIs for CLI: `createProgramContext`, `analyzeClass`, `generateClassSchemas`

## Testing

- **Runtime tests**: Vitest — `pnpm --filter @formspec/dsl run test`
- **Type tests**: tsd — `pnpm --filter @formspec/dsl run test:types`
- **ESLint rule tests**: RuleTester via Vitest — `pnpm --filter @formspec/eslint-plugin run test`
- Type test files go in `src/__tests__/*.test-d.ts`
- Class/interface analysis pipeline tests use fixture files in `src/__tests__/fixtures/`
- The `@formspec/build` package must be built before its tests run (`pnpm run build && vitest run`)

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
- Decorators are no-ops at runtime — constraint metadata is extracted via static AST analysis
- JSDoc/TSDoc constraint tags (`/** @Minimum 0 @Maximum 100 */`) are parsed from source alongside decorator metadata in the analysis pipeline
- API Extractor manages public API surface for library packages — commit `api-report/` files
