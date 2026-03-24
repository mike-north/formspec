# Architecture

FormSpec is a TypeScript monorepo for defining type-safe forms that compile to [JSON Schema](https://json-schema.org/) (for validation) and [JSON Forms UI Schema](https://jsonforms.io/) (for rendering).

## Package Dependency Graph

```
formspec (umbrella — re-exports everything)
├── @formspec/core         (shared type definitions)
├── @formspec/dsl          (chain DSL builder functions)
├── @formspec/build        (schema generators + static analysis)
└── @formspec/runtime      (dynamic field resolvers)

@formspec/cli              (CLI tool)
└── @formspec/build/internals

@formspec/constraints      (constraint validation)
└── @formspec/core

@formspec/eslint-plugin    (lint rules for FormSpec)
├── @formspec/constraints
└── @formspec/core

@formspec/validator        (JSON Schema validator — @cfworker/json-schema)

@formspec/language-server  (LSP features for editors)
└── @formspec/core

@formspec/playground       (interactive browser editor — private)
└── [all packages]
```

### Build Order

Packages build in dependency order. `pnpm run build` at the root handles this automatically.

1. `@formspec/core` — no dependencies
2. `@formspec/dsl`, `@formspec/runtime`, `@formspec/constraints` — depend on core
3. `@formspec/build` — depends on core
4. `@formspec/cli`, `@formspec/eslint-plugin` — depend on build/constraints
5. `formspec` — umbrella, depends on all above
6. `@formspec/playground` — depends on everything, private

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

## Constraints (`@formspec/constraints`)

Restricts which FormSpec features are allowed, configured via `.formspec.yml`:

```yaml
constraints:
  fieldTypes:
    dynamicEnum: error # Disallow dynamic enums
    dynamicSchema: error # Disallow dynamic schemas
  layout:
    group: off # Allow groups
    conditionals: warn # Warn on conditionals
    maxNestingDepth: 3 # Limit nesting
  fieldOptions:
    placeholder: off # Allow placeholders
```

### Enforcement Layers

| Layer            | Tool                            | When                           |
| ---------------- | ------------------------------- | ------------------------------ |
| **Build-time**   | `@formspec/eslint-plugin`       | During linting / CI            |
| **Programmatic** | `validateFormSpec()`            | At runtime or in build scripts |
| **Browser**      | `@formspec/constraints/browser` | In the playground              |

## ESLint Plugin (`@formspec/eslint-plugin`)

### JSDoc Constraint Rules

| Rule | Purpose |
| --- | --- |
| `constraint-type-mismatch` | `@Minimum`/`@Maximum` only on `number`; `@MinLength`/`@Pattern` only on `string` |
| `consistent-constraints` | `@Minimum ≤ @Maximum`; no conflicting bounds |

### Chain DSL Rules

| Rule                              | Purpose                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `constraints-allowed-field-types` | `field.text()`, `field.dynamicEnum()`, etc. validated against `.formspec.yml` |
| `constraints-allowed-layouts`     | `group()`, `when()` validated against `.formspec.yml`                         |

## Entry Points

`@formspec/build` provides three entry points for different consumers:

| Entry Point                 | Audience             | Exports                                                                           |
| --------------------------- | -------------------- | --------------------------------------------------------------------------------- |
| `@formspec/build`           | Public API           | `buildFormSchemas`, `writeSchemas`, `generateSchemasFromClass`, schema generators |
| `@formspec/build/browser`   | Browser (playground) | Schema generators without Node.js fs/path                                         |
| `@formspec/build/internals` | CLI (unstable)       | `createProgramContext`, `analyzeClass`, `generateClassSchemas` |

## Testing Strategy

### Test Layers

| Layer                | Framework  | Location                                   | Purpose                                    |
| -------------------- | ---------- | ------------------------------------------ | ------------------------------------------ |
| **Unit**             | Vitest     | `src/__tests__/*.test.ts`                  | Individual functions in isolation          |
| **Type**             | tsd        | `src/__tests__/*.test-d.ts`                | Type inference correctness                 |
| **Integration**      | Vitest     | `src/__tests__/integration.test.ts`        | Full pipeline (DSL → schema)               |
| **Fixture-based**    | Vitest     | `src/__tests__/fixtures/`                  | Real TypeScript files through the analyzer |
| **ESLint rule**      | RuleTester | `src/__tests__/rules/*.test.ts`            | Valid/invalid code patterns per rule       |
| **Example projects** | Vitest     | `examples/*/test/schemas.test.ts`          | Schema snapshot validation                 |

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
- **Pre-release**: Currently on `0.1.0-alpha.*`
- All publishable packages use `"publishConfig": { "access": "public" }`

## TypeScript Configuration

Strict mode with additional strictness flags:

- `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- `noImplicitOverride`, `noPropertyAccessFromIndexSignature`
- `verbatimModuleSyntax`, `isolatedModules`, `noEmitOnError`
- No `esModuleInterop` or `allowSyntheticDefaultImports` (library compatibility)
- Target: ES2022, Module: NodeNext
