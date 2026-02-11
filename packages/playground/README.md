# @formspec/playground

Interactive playground for FormSpec - write forms and see generated schemas live.

## Features

- **Real-time compilation** - TypeScript transpilation and FormSpec validation as you type
- **Live schema generation** - See JSON Schema and UI Schema output instantly
- **Interactive form preview** - Rendered forms using JSON Forms + Material UI
- **Monaco editor** - Full TypeScript support with FormSpec type definitions
- **ESLint integration** - Constraint violations shown as editor markers
- **Configurable constraints** - UI for restricting which DSL features are allowed

## Running Locally

```bash
# From the monorepo root
pnpm install
pnpm run build
cd packages/playground
pnpm run dev
```

The playground will be available at `http://localhost:5173/formspec/`.

## Architecture

```
User Code (Monaco) ──► TypeScript Compile ──► Execute ──► FormSpec Object
                                                              │
Constraints Config ─────────────────────────────────────────►│
                                                              ▼
                                              ┌───────────────────────────┐
                                              │    generateJsonSchema()   │
                                              │    generateUiSchema()     │
                                              │    validateFormSpec()     │
                                              └───────────────────────────┘
                                                              │
                    ┌─────────────────┬───────────────────────┼───────────────────┐
                    ▼                 ▼                       ▼                   ▼
              JSON Schema       UI Schema             Lint Issues          Form Preview
                Panel             Panel                 Panel              (JSON Forms)
```

### Key Components

- **Editor** (`src/components/Editor/`) - Monaco editor wrapper with FormSpec types
- **Compiler** (`src/lib/compiler.ts`) - TypeScript transpilation + sandboxed execution + schema generation
- **Linter** (`src/lib/linter.ts`) - Browser-based ESLint with `@formspec/eslint-plugin` rules
- **Preview** (`src/components/Preview/`) - Live form rendering with JSON Forms
- **Constraints** (`src/components/Constraints/`) - UI for configuring DSL restrictions

### Browser Entry Points

The playground uses browser-safe entry points that exclude Node.js APIs:

- `@formspec/build/browser` - Schema generation without `node:fs`
- `@formspec/constraints/browser` - Validation without file system access

## Deployment

Automatically deployed to GitHub Pages on push to `main` branch when changes are made to:
- `packages/playground/**`
- `packages/core/**`
- `packages/dsl/**`
- `packages/build/**`
- `packages/constraints/**`

The deployed playground is available at: https://mike-north.github.io/formspec/

## Scripts

- `pnpm run dev` - Start development server
- `pnpm run build` - Build for production
- `pnpm run preview` - Preview production build
- `pnpm run test` - Run tests
- `pnpm run typecheck` - Type check without emitting
