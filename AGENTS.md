# AGENTS.md

Guidance for coding agents working in this repository.

## Read these first

Before making any change, read in this order:

1. [`formspec.cml`](./formspec.cml) — the formal bounded-context model. Authoritative.
2. [`BOUNDED_CONTEXTS.md`](./BOUNDED_CONTEXTS.md) — prose reader companion to the CML.
3. [`GLOSSARY.md`](./GLOSSARY.md) — project vocabulary; pin the right term before writing code or commits.
4. [`docs/000-principles.md`](./docs/000-principles.md) — the architectural invariants the system upholds.

When in doubt about which package owns a concept, search `GLOSSARY.md` and `formspec.cml`. When in doubt about a cross-package change, the relationships in `formspec.cml` are the contract.

## Overview

FormSpec is a TypeScript monorepo for defining type-safe forms that compile to JSON Schema 2020-12 and JSON Forms UI Schema.

Primary packages:

- `formspec` — umbrella package re-exporting common runtime-facing APIs
- `@formspec/core` — shared form types, canonical IR types, extension APIs
- `@formspec/dsl` — chain DSL authoring surface
- `@formspec/build` — schema generation and static TypeScript analysis
- `@formspec/runtime` — resolver helpers for dynamic enum/schema sources
- `@formspec/analysis` — shared semantic-analysis protocol types and helpers
- `@formspec/config` — `formspec.config.ts` loading and DSL capability validation
- `@formspec/eslint-plugin` — lint rules for tags and DSL usage
- `@formspec/ts-plugin` — TypeScript language-service plugin and semantic service
- `@formspec/language-server` — reference LSP implementation over shared helpers
- `@formspec/cli` — CLI for schema and IR generation
- `@formspec/validator` — runtime JSON Schema validation
- `@formspec/playground` — private browser playground app
- `@formspec/e2e` — end-to-end and benchmark workspace (`/e2e`)

## Repo Commands

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run test:e2e
pnpm run typecheck
pnpm run lint
pnpm run lint:fix
pnpm run format:check
pnpm run format
pnpm run api-extractor
pnpm run api-extractor:local
pnpm run api-documenter
```

Package-scoped examples:

```bash
pnpm --filter @formspec/build run test
pnpm --filter @formspec/dsl run test:types
pnpm --filter @formspec/eslint-plugin run fix:eslint-docs
pnpm --filter @formspec/eslint-plugin run check:eslint-docs
pnpm --filter @formspec/playground run dev
```

## Working Rules

- Use `pnpm`.
- The workspace `engines.node` is `>=24`.
- Prefer `rg` for file and text search.
- API surface changes usually require updated `api-report/` files.
- This repo uses Changesets. User-facing package changes may need a `.changeset/*.md` entry.
- Do not assume generated docs are authoritative if source exports disagree. Check the source first.

## Architecture Notes

- `group()` is layout-only and does not change the data shape.
- `field.object()` and `field.array()` create nested schema structure.
- `when(is(...), ...)` controls UI visibility; conditional fields are still present in schema inference as optional fields.
- Static analysis uses TSDoc-style comments on classes, interfaces, and type aliases.
- Use lowercase tag examples such as `@minimum`, `@maximum`, and `@displayName`.
- `@description` is intentionally unsupported. Summary text becomes JSON Schema `description`; `@remarks` is separate metadata.
- `@formspec/build` public entry points are:
  - `@formspec/build`
  - `@formspec/build/browser`
  - `@formspec/build/internals`
- `@formspec/build` exports include `generateSchemas`, `generateSchemasFromClass`, `generateSchemasFromProgram`, and `buildMixedAuthoringSchemas`.
- `@formspec/language-server` is built on top of plugin-backed diagnostics from `@formspec/ts-plugin`.

## Testing Notes

- Vitest is the main test runner.
- `tsd` is used for type-level tests in packages that expose `test:types`.
- `@formspec/build` test script builds the package before running tests.
- `e2e/` contains integration fixtures for chain DSL, TSDoc analysis, CLI flows, and benchmark coverage.

## Useful Files

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [README.md](./README.md)
- [docs/002-tsdoc-grammar.md](./docs/002-tsdoc-grammar.md)
- [docs/004-tooling.md](./docs/004-tooling.md)
