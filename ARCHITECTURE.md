# Architecture

FormSpec is a TypeScript monorepo for defining type-safe forms that compile to [JSON Schema](https://json-schema.org/) (for validation) and [JSON Forms UI Schema](https://jsonforms.io/) (for rendering).

> **Companion documents.** This file describes the implementation: package responsibilities, build pipeline, and tooling. For the architectural _model_ — bounded contexts, subdomains, and inter-context relationships in formal Context Mapper Language — see [`formspec.cml`](./formspec.cml). The reader-friendly companion is [`BOUNDED_CONTEXTS.md`](./BOUNDED_CONTEXTS.md). The project's vocabulary lives in [`GLOSSARY.md`](./GLOSSARY.md). Architectural invariants are in [`docs/000-principles.md`](./docs/000-principles.md).

## Package Dependency Graph

```
formspec (umbrella — re-exports everything)
├── @formspec/core         (shared type definitions)
├── @formspec/dsl          (chain DSL builder functions)
├── @formspec/build        (schema generators + static analysis)
└── @formspec/runtime      (dynamic field resolvers)

@formspec/cli              (CLI tool)
└── @formspec/build/internals

@formspec/config           (constraint validation + formspec.config.ts loader)
└── @formspec/core

@formspec/analysis         (shared comment-tag analysis utilities)
└── @formspec/core

@formspec/eslint-plugin    (lint rules for FormSpec)
├── @formspec/analysis
├── @formspec/build
├── @formspec/config
└── @formspec/core

@formspec/validator        (JSON Schema validator — @cfworker/json-schema)

@formspec/ts-plugin        (TypeScript plugin + composable semantic service — reference implementation inside tsserver)
└── @formspec/analysis

@formspec/language-server  (reference LSP implementation — thin presentation layer over composable helpers)
├── @formspec/analysis
└── @formspec/core

@formspec/playground       (interactive browser editor — private)
└── [all packages]
```

### Build Order

Packages build in dependency order. `pnpm run build` at the root handles this automatically.

1. `@formspec/core` — no dependencies
2. `@formspec/dsl`, `@formspec/runtime`, `@formspec/config` — depend on core
3. `@formspec/analysis` — depends on core
4. `@formspec/build` — depends on core, analysis, config
5. `@formspec/cli`, `@formspec/eslint-plugin` — depend on build/config/analysis
6. `@formspec/ts-plugin` — depends on analysis
7. `@formspec/language-server` — depends on analysis, core
8. `formspec` — umbrella, depends on all above
9. `@formspec/playground` — depends on everything, private

## DSL

FormSpec uses a builder-based Chain DSL (`@formspec/dsl`) as the primary approach for defining forms.

### Chain DSL (`@formspec/dsl`)

Builder functions with full type inference:

```typescript
import { formspec, field, group, when, is } from "@formspec/dsl";

const InvoiceForm = formspec(
  group(
    "Customer",
    field.text("name", { label: "Name", required: true }),
    field.dynamicEnum("country", "countries", { label: "Country" })
  ),
  group(
    "Details",
    field.number("amount", { label: "Amount", min: 0, required: true }),
    field.enum("status", ["draft", "sent", "paid"] as const),
    when(is("status", "draft"), field.text("notes", { label: "Internal Notes" }))
  )
);

type Schema = InferFormSchema<typeof InvoiceForm>;
// { name: string; country: string; amount: number; status: "draft" | "sent" | "paid"; notes?: string }
```

## Core Type System (`@formspec/core`)

### Form Elements

All form elements implement a discriminated union on `_type`:

| Element                       | `_type`         | `_field`           | Schema Inference               |
| ----------------------------- | --------------- | ------------------ | ------------------------------ |
| `TextField<N>`                | `"field"`       | `"text"`           | `string`                       |
| `NumberField<N>`              | `"field"`       | `"number"`         | `number`                       |
| `BooleanField<N>`             | `"field"`       | `"boolean"`        | `boolean`                      |
| `StaticEnumField<N, O>`       | `"field"`       | `"enum"`           | Union of option values         |
| `DynamicEnumField<N, S>`      | `"field"`       | `"dynamic_enum"`   | `DataSourceValueType<S>`       |
| `DynamicSchemaField<N>`       | `"field"`       | `"dynamic_schema"` | `Record<string, unknown>`      |
| `ArrayField<N, Items>`        | `"field"`       | `"array"`          | `InferSchema<Items>[]`         |
| `ObjectField<N, Props>`       | `"field"`       | `"object"`         | `InferSchema<Props>`           |
| `Group<Elements>`             | `"group"`       | —                  | Transparent (fields extracted) |
| `Conditional<K, V, Elements>` | `"conditional"` | —                  | Fields become optional         |

### Type Inference Pipeline

The inference system in `@formspec/dsl` works through several levels:

```
FormSpec<Elements>
  → ExtractFields<Elements>           // Flatten groups, extract from conditionals
  → Split: non-conditional vs conditional fields
  → BuildSchema<NonConditional>       // { name: type } — required
  → Partial<BuildSchema<Conditional>> // { name?: type } — optional
  → FlattenIntersection               // Merge into single clean type
```

Key insight: **Groups are transparent** (fields pass through for schema), while **conditionals make fields optional** (they're always in the schema but may not be visible).

## Schema Generation Pipeline

### Chain DSL Path

```
FormSpec definition
  → canonicalizeChainDSL()        // Convert to Canonical IR
  → generateJsonSchemaFromIR(ir)  // Walk IR, map to JSON Schema
  → generateUiSchemaFromIR(ir)    // Walk IR, generate JSON Forms controls + layouts
```

The JSON Schema generator maps field types directly:

- `field.text()` → `{ type: "string" }`
- `field.number()` with `min`/`max` → `{ type: "number", minimum, maximum }`
- `field.enum()` → `{ type: "string", enum: [...] }`
- `field.dynamicEnum()` → `{ type: "string", "x-formspec-source": key }`
- `group()` → Transparent in JSON Schema; becomes `GroupLayout` in UI Schema
- `when()` → Fields included unconditionally in JSON Schema; UI Schema gets `rule: { effect: "SHOW", condition: ... }`

### Static Analysis Types

The static analysis pipeline uses JSDoc constraint tags (`/** @Minimum 0 @Maximum 100 */`) to extract constraints from TypeScript class definitions:

```
ClassAnalysis
├── fields: FieldInfo[]
│   ├── name: string
│   ├── type: ts.Type              // Resolved TypeScript type
│   ├── optional: boolean
│   ├── jsDocConstraints: ConstraintInfo[]  // constraints from JSDoc tags
│   │   ├── name: string           // "Minimum", "Maximum", etc.
│   │   └── args: ConstraintArg[]  // Parsed literal values
│   ├── deprecated: boolean        // From JSDoc @deprecated
│   └── defaultValue: unknown      // From property initializer
├── instanceMethods: MethodInfo[]
└── staticMethods: MethodInfo[]
```

### Nested Class Constraint Propagation

When a class field's type is another class (e.g., `address!: Address`), the type converter navigates from `ts.Type` → class declaration → `analyzeField()` on each property to extract JSDoc constraint metadata for nested properties. This is handled by `getObjectPropertyInfos()`, a shared helper used by both the JSON Schema and UI Schema paths.

Circular references (e.g., `NodeA.sibling?: NodeB`, `NodeB.sibling?: NodeA`) are detected via visited-type sets. The JSON Schema path produces `{ type: "object" }` at the cycle point; the UI Schema path omits nested fields.

## CLI (`@formspec/cli`)

### `formspec generate <file> [className] [options]`

Combines static analysis with optional runtime loading:

1. Create TypeScript program context
2. Analyze class via static analysis (types + JSDoc constraint tags)
3. Optionally load compiled JS to resolve chain DSL FormSpec exports (runtime)
4. Generate JSON Schema + UI Schema for class fields and methods
5. Write output files

Options include `--emit-ir` (output Canonical IR as JSON) and `--validate-only` (validate without writing files).

## Constraints (`@formspec/config`)

Restricts which FormSpec features are allowed, configured in TypeScript via `formspec.config.ts` (or `.mts`/`.js`/`.mjs`). See [`docs/007-configuration.md`](./docs/007-configuration.md) for the full configuration spec.

```typescript
// formspec.config.ts
import { defineFormSpecConfig } from "@formspec/config";

export default defineFormSpecConfig({
  constraints: {
    fieldTypes: {
      dynamicEnum: "error", // Disallow dynamic enums
      dynamicSchema: "error", // Disallow dynamic schemas
    },
    layout: {
      group: "off", // Allow groups
      conditionals: "warn", // Warn on conditionals
      maxNestingDepth: 3, // Limit nesting
    },
    fieldOptions: {
      placeholder: "off", // Allow placeholders
    },
  },
});
```

### Enforcement Layers

| Layer            | Tool                       | When                           |
| ---------------- | -------------------------- | ------------------------------ |
| **Build-time**   | `@formspec/eslint-plugin`  | During linting / CI            |
| **Programmatic** | `validateFormSpec()`       | At runtime or in build scripts |
| **Browser**      | `@formspec/config/browser` | In browser-embedded validation |

## ESLint Plugin (`@formspec/eslint-plugin`)

### JSDoc Constraint Rules

| Rule                       | Purpose                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| `constraint-type-mismatch` | `@Minimum`/`@Maximum` only on `number`; `@MinLength`/`@Pattern` only on `string` |
| `consistent-constraints`   | `@Minimum ≤ @Maximum`; no conflicting bounds                                     |

### Chain DSL Rules

| Rule                              | Purpose                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `constraints-allowed-field-types` | `field.text()`, `field.dynamicEnum()`, etc. validated against `formspec.config.ts` |
| `constraints-allowed-layouts`     | `group()`, `when()` validated against `formspec.config.ts`                         |

## Tooling Architecture

FormSpec editor tooling uses a hybrid split:

- `@formspec/analysis` owns shared comment parsing, semantic modeling, caching primitives, and transport-safe snapshot/protocol types.
- `@formspec/ts-plugin` owns the reusable semantic service that works directly against a host `Program`/`TypeChecker`. Its shipped tsserver plugin and IPC server are reference implementations built on that same public service.
- `@formspec/language-server` exports composable completion, hover, and diagnostics helpers. Its packaged LSP is a thin reference implementation that wires those helpers together.

This is intentionally white-labelable: downstream tools can reuse the same
TypeScript `Program`, call `FormSpecSemanticService` directly, and decide for
themselves how diagnostics are surfaced.

## Entry Points

`@formspec/build` provides three entry points for different consumers:

| Entry Point                 | Audience             | Exports                                                                           |
| --------------------------- | -------------------- | --------------------------------------------------------------------------------- |
| `@formspec/build`           | Public API           | `buildFormSchemas`, `writeSchemas`, `generateSchemasFromClass`, schema generators |
| `@formspec/build/browser`   | Browser (playground) | Schema generators without Node.js fs/path                                         |
| `@formspec/build/internals` | CLI (unstable)       | `createProgramContext`, `analyzeClass`, `generateClassSchemas`                    |

## Testing Strategy

### Test Layers

| Layer                | Framework  | Location                            | Purpose                                    |
| -------------------- | ---------- | ----------------------------------- | ------------------------------------------ |
| **Unit**             | Vitest     | `src/__tests__/*.test.ts`           | Individual functions in isolation          |
| **Type**             | tsd        | `src/__tests__/*.test-d.ts`         | Type inference correctness                 |
| **Integration**      | Vitest     | `src/__tests__/integration.test.ts` | Full pipeline (DSL → schema)               |
| **Fixture-based**    | Vitest     | `src/__tests__/fixtures/`           | Real TypeScript files through the analyzer |
| **ESLint rule**      | RuleTester | `src/__tests__/rules/*.test.ts`     | Valid/invalid code patterns per rule       |
| **Example projects** | Vitest     | `examples/*/test/schemas.test.ts`   | Schema snapshot validation                 |

### Test Infrastructure

- **Fixtures**: Real TypeScript files in `src/__tests__/fixtures/` compiled by the TypeScript program
- **Timeout config**: 15s for packages with heavy TS analysis (cli, eslint-plugin); 5s default
- **Circular reference tests**: Use Vitest timeout guards to prevent hangs

## Playground (`@formspec/playground`)

Interactive browser-based editor (React + Vite + Monaco Editor):

1. **Editor**: Monaco with TypeScript syntax highlighting
2. **Compiler**: `ts.transpileModule()` → execute → `buildFormSchemas()` → constraint validation
3. **Output tabs**: JSON Schema, UI Schema, live form preview (JSON Forms), lint results, constraints
4. **Persistence**: Code and constraint settings saved to localStorage
5. **Debounced**: Compilation runs on idle after 500ms of inactivity

## Versioning & Publishing

- **Changesets** for version management — all `@formspec/*` packages are version-linked
- **API Extractor** generates `.d.ts` rollups and API reports for library packages
- API Extractor diagnostics that indicate an invalid published API surface, such as forgotten exports, are treated as CI-blocking errors rather than informational `api-report/` warnings
- **Pre-release**: Currently on `0.1.0-alpha.*`
- All publishable packages use `"publishConfig": { "access": "public" }`

## Debugging Constraint Validation

The constraint-validation pipeline emits structured debug logs via the
`formspec:analysis:constraint-validator` namespace family. Enable them with the
`DEBUG` environment variable using the same comma-separated glob convention as
the [`debug`](https://github.com/debug-js/debug) npm package.

### Enabling logs

```bash
# All constraint-validator namespaces (most verbose)
DEBUG=formspec:analysis:constraint-validator:* pnpm run build

# Build consumer only (tsdoc-parser.ts)
DEBUG=formspec:analysis:constraint-validator:build pnpm run build

# Snapshot consumer only (file-snapshots.ts, IDE/LSP path)
DEBUG=formspec:analysis:constraint-validator:snapshot pnpm run build

# Broadening-bypass decisions only
DEBUG=formspec:analysis:constraint-validator:broadening pnpm run build

# Extension-registry construction and setup diagnostics
DEBUG=formspec:analysis:constraint-validator:registry pnpm run build
```

### Per-tag-application log-entry schema (§8.3b)

Each constraint-tag evaluation emits one structured record at `debug` level.

| Field             | Type                    | Description                                                                    |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------ |
| `consumer`        | `"build" \| "snapshot"` | Which pipeline emitted this entry                                              |
| `tag`             | `string`                | Normalized tag name, e.g. `"minimum"`                                          |
| `placement`       | `string`                | Declaration placement, e.g. `"class-field"`                                    |
| `subjectTypeKind` | `string`                | Human-readable type description, e.g. `"primitive/string"`, `"object/Decimal"` |
| `roleOutcome`     | `string`                | Final role in the validation pipeline (see below)                              |
| `elapsedMicros`   | `number`                | Microseconds for this tag's full validation path                               |

#### Role outcome values

Phase 5C retired the synthetic TypeScript program batch. Constraint-tag
validation now flows through three roles in order: Role A (placement), Role B
(capability guard, including path-target resolution), Role C (typed-parser
argument validation). A `C-pass` outcome means all three roles accepted.

| Value      | Meaning                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `A-pass`   | Placement check passed; tag accepted without reaching role C                                                                     |
| `A-reject` | Placement check failed (`INVALID_TAG_PLACEMENT`)                                                                                 |
| `B-pass`   | Path/target check passed (for path-targeted constraints)                                                                         |
| `B-reject` | Capability or path-target check failed (`TYPE_MISMATCH`, `UNKNOWN_PATH_TARGET`, `UNSUPPORTED_TARGETING_SYNTAX`)                  |
| `C-pass`   | Typed-parser argument validation passed — terminal success outcome                                                               |
| `C-reject` | Typed-parser argument validation failed (`INVALID_TAG_ARGUMENT`, `MISSING_TAG_ARGUMENT`, `TYPE_MISMATCH` from `@const` IR check) |
| `D1`       | Direct-field custom-constraint dispatch (custom-type broadening)                                                                 |
| `D2`       | Path-target built-in broadening dispatch                                                                                         |
| `bypass`   | Broadening registry short-circuit (tag accepted without role-C check)                                                            |

### Sample log excerpt

Running the `integer-type.test.ts` fixture with
`DEBUG=formspec:analysis:constraint-validator:*` produces entries like:

```json
{"level":20,"name":"formspec:analysis:constraint-validator:build","msg":"constraint-tag application","consumer":"build","tag":"minimum","placement":"class-field","subjectTypeKind":"primitive/number","roleOutcome":"bypass","elapsedMicros":12}
{"level":20,"name":"formspec:analysis:constraint-validator:build","msg":"constraint-tag application","consumer":"build","tag":"maximum","placement":"class-field","subjectTypeKind":"primitive/number","roleOutcome":"bypass","elapsedMicros":8}
```

From the `elapsedMicros` and `roleOutcome` fields alone, a reviewer can
reconstruct the full A→bypass decision path for every constraint tag without
consulting source code.

## TypeScript Configuration

Strict mode with additional strictness flags:

- `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- `noImplicitOverride`, `noPropertyAccessFromIndexSignature`
- `verbatimModuleSyntax`, `isolatedModules`, `noEmitOnError`
- No `esModuleInterop` or `allowSyntheticDefaultImports` (library compatibility)
- Target: ES2022, Module: NodeNext
