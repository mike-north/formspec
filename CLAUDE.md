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

# Run e2e tests
pnpm run test:e2e

# Run tests in a specific package
pnpm --filter @formspec/dsl run test

# Run tests in watch mode (in a package directory)
cd packages/dsl && pnpm exec vitest

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

# Generate markdown API docs
pnpm run api-documenter

# ESLint plugin docs
pnpm --filter @formspec/eslint-plugin run fix:eslint-docs
pnpm --filter @formspec/eslint-plugin run check:eslint-docs
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
@formspec/ts-plugin        (TypeScript plugin + composable semantic service — reference implementation inside tsserver, depends on @formspec/analysis)
@formspec/language-server  (reference LSP implementation — thin presentation layer over composable helpers, depends on @formspec/analysis and @formspec/core)
@formspec/playground       (interactive browser editor — private, depends on all)
@formspec/e2e             (workspace for end-to-end tests and benchmarks)
```

### Key Concepts

1. **Chain DSL**: Builder functions (`field.*`, `group`, `when`, `formspec`) with full type inference
2. **Type Inference**: Schema types are inferred from form definitions — use `InferFormSchema<typeof form>`
3. **Groups vs Objects**: `group()` is UI-only organization (flat schema); `field.object()` creates nested data
4. **Conditionals**: `when(is("field", "value"), ...)` controls UI visibility but all fields remain in schema
5. **Dynamic Fields**: `field.dynamicEnum()` for runtime-fetched options; resolver functions defined via `defineResolvers()`
6. **TSDoc Constraints**: Tags like `/** @minimum 0 */` produce constraint nodes in the Canonical IR; they propagate through nested class types
7. **Canonical IR**: All form definitions pass through an intermediate representation before schema generation
8. **Hybrid Tooling**: `@formspec/ts-plugin` exposes the reusable semantic service that works against a host TypeScript program; the shipped tsserver plugin and `@formspec/language-server` are reference implementations built on those lower-level APIs
9. **Description Semantics**: Summary text becomes JSON Schema `description`; `@description` is intentionally unsupported; `@remarks` is carried separately as metadata

### Build Order

Packages must build in dependency order. The root `pnpm run build` handles this automatically. For manual builds:

1. `@formspec/core` (no deps)
2. `@formspec/dsl`, `@formspec/runtime`, `@formspec/constraints` (depend on core)
3. `@formspec/analysis` (depends on core)
4. `@formspec/build` (depends on core and analysis at runtime; peer dep on typescript)
5. `@formspec/cli`, `@formspec/eslint-plugin` (depend on build/constraints/analysis)
6. `@formspec/ts-plugin` (depends on analysis)
7. `@formspec/language-server` (depends on analysis, core)
8. `formspec` (umbrella, depends on core, dsl, build, runtime)
9. `@formspec/playground` and `@formspec/e2e` (depend on many/all packages)

### Entry Points

`@formspec/build` has three entry points:

- `@formspec/build` — Public API: `buildFormSchemas`, `writeSchemas`, `generateSchemas`, `generateSchemasFromClass`, `generateSchemasFromProgram`, `buildMixedAuthoringSchemas`
- `@formspec/build/browser` — Browser-safe subset for chain-DSL and IR work (no Node.js fs/path)
- `@formspec/build/internals` — Unstable internal APIs used by the CLI and monorepo tooling

## Testing

- **Runtime tests**: Vitest — `pnpm --filter @formspec/dsl run test`
- **Type tests**: tsd — `pnpm --filter @formspec/dsl run test:types`
- **ESLint rule tests**: RuleTester via Vitest — `pnpm --filter @formspec/eslint-plugin run test`
- **E2E tests**: `pnpm run test:e2e`
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
- TSDoc constraint tags (`/** @minimum 0 @maximum 100 */`) are extracted via static AST analysis
- Do not use `@description`; use summary text before block tags and `@remarks` for programmatic notes
- API Extractor manages public API surface for library packages — commit `api-report/` files

## Supported TypeScript versions

FormSpec packages with a `typescript` peer-dep declare `>=5.9.3 <7`. The CI matrix in `.github/workflows/ci.yml` exercises:

- the workspace's pinned TS major (currently 6.x — required, blocking),
- the previous stable major (5.x — required, regression coverage),
- the `beta` and nightly dist-tags (experimental, non-blocking).

TypeScript 7.x is the Go rewrite with a substantively different API surface. We do not test against it via dist-tag drift; it will be a deliberate, separate migration.

### TypeScript compiler API quirks across majors

When code reaches into TypeScript's compiler API (`ts.Type`, `ts.Symbol`, `ts.TypeChecker`, etc.), be aware that some internals are not part of the public API contract and shift between majors. The most common pitfall:

- **`ts.TypeFlags` numeric values were renumbered between TS 5.x and TS 6.x.** Always reference flags by enum member (`type.flags & ts.TypeFlags.Null`), never by hardcoded number (`type.flags & 65536`). See [`packages/eslint-plugin/src/utils/type-utils.ts`](packages/eslint-plugin/src/utils/type-utils.ts) for a full table and rationale.

When in doubt, `import * as ts from "typescript"` (rather than `import type`) so enum references resolve at runtime against the host's installed TypeScript.
