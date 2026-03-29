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

@formspec/analysis         (shared comment-tag analysis — depends on @formspec/core)
@formspec/cli              (CLI tool — depends on @formspec/build/internals)
@formspec/eslint-plugin    (ESLint rules — depends on @formspec/analysis, @formspec/constraints, @formspec/core)
@formspec/constraints      (constraint validation — depends on @formspec/core)
@formspec/validator        (JSON Schema validation — @cfworker/json-schema)
@formspec/ts-plugin        (TypeScript language service plugin — semantic authority inside tsserver, depends on @formspec/analysis)
@formspec/language-server  (LSP presentation layer — consumes plugin transport, depends on @formspec/analysis)
@formspec/playground       (interactive browser editor — private, depends on all)
```

### Key Concepts

1. **Chain DSL**: Builder functions (`field.*`, `group`, `when`, `formspec`) with full type inference
2. **Type Inference**: Schema types are inferred from form definitions — use `InferFormSchema<typeof form>`
3. **Groups vs Objects**: `group()` is UI-only organization (flat schema); `field.object()` creates nested data
4. **Conditionals**: `when(is("field", "value"), ...)` controls UI visibility but all fields remain in schema
5. **Dynamic Fields**: `field.dynamicEnum()` for runtime-fetched options; resolver functions defined via `defineResolvers()`
6. **JSDoc Constraints**: Tags like `/** @Minimum 0 */` produce constraint nodes in the Canonical IR; they propagate through nested class types
7. **Canonical IR**: All form definitions pass through an intermediate representation before schema generation
8. **Hybrid Tooling**: `@formspec/ts-plugin` reuses the editor's TypeScript program for semantic comment analysis; `@formspec/language-server` stays cheap locally and enriches responses over manifest + IPC

### Build Order

Packages must build in dependency order. The root `pnpm run build` handles this automatically. For manual builds:

1. `@formspec/core` (no deps)
2. `@formspec/dsl`, `@formspec/runtime`, `@formspec/constraints` (depend on core)
3. `@formspec/analysis` (depends on core)
4. `@formspec/build` (depends on core; peer dep on typescript)
5. `@formspec/cli`, `@formspec/eslint-plugin` (depend on build/constraints/analysis)
6. `@formspec/ts-plugin` (depends on analysis)
7. `@formspec/language-server` (depends on analysis, core)
8. `formspec` (umbrella, depends on all above)
9. `@formspec/playground` (depends on everything, private)

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
- Static analysis pipeline tests use fixture files in `src/__tests__/fixtures/`
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
- JSDoc constraint tags (`/** @Minimum 0 @Maximum 100 */`) are extracted via static AST analysis
- API Extractor manages public API surface for library packages — commit `api-report/` files
