# Architecture

FormSpec is a TypeScript monorepo for defining type-safe forms that compile to [JSON Schema](https://json-schema.org/) (for validation) and [JSON Forms UI Schema](https://jsonforms.io/) (for rendering).

## Package Dependency Graph

```
formspec (umbrella — re-exports everything)
├── @formspec/core         (shared type definitions)
├── @formspec/dsl          (chain DSL builder functions)
├── @formspec/build        (schema generators + static analysis)
└── @formspec/runtime      (dynamic field resolvers)

@formspec/decorators       (decorator DSL — independent, no deps)

@formspec/cli              (CLI tool)
└── @formspec/build/internals

@formspec/constraints      (constraint validation)
└── @formspec/core

@formspec/eslint-plugin    (lint rules for both DSLs)
├── @formspec/constraints
└── @formspec/core

@formspec/playground       (interactive browser editor — private)
└── [all packages]
```

### Build Order

Packages build in dependency order. `pnpm run build` at the root handles this automatically.

1. `@formspec/core` — no dependencies
2. `@formspec/decorators` — no library dependencies
3. `@formspec/dsl`, `@formspec/runtime`, `@formspec/constraints` — depend on core
4. `@formspec/build` — depends on core
5. `@formspec/cli`, `@formspec/eslint-plugin` — depend on build/constraints
6. `formspec` — umbrella, depends on all above
7. `@formspec/playground` — depends on everything, private

## Two DSLs

FormSpec offers two ways to define forms that compile to the same output.

### Chain DSL (`@formspec/dsl`)

Builder functions with full type inference:

```typescript
import { formspec, field, group, when, is } from "@formspec/dsl";

const InvoiceForm = formspec(
  group("Customer",
    field.text("name", { label: "Name", required: true }),
    field.dynamicEnum("country", "countries", { label: "Country" }),
  ),
  group("Details",
    field.number("amount", { label: "Amount", min: 0, required: true }),
    field.enum("status", ["draft", "sent", "paid"] as const),
    when(is("status", "draft"),
      field.text("notes", { label: "Internal Notes" }),
    ),
  ),
);

type Schema = InferFormSchema<typeof InvoiceForm>;
// { name: string; country: string; amount: number; status: "draft" | "sent" | "paid"; notes?: string }
```

### Decorator DSL (`@formspec/decorators`)

TypeScript class decorators analyzed via static analysis:

```typescript
import { Field, MinLength, MaxLength, Minimum, Pattern } from "@formspec/decorators";

class UserForm {
  @Field({ displayName: "Full Name" })
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @Field({ displayName: "Age" })
  @Minimum(0)
  age!: number;

  @Field({ displayName: "Email" })
  @Pattern("^[^@]+@[^@]+$")
  email?: string;
}
```

All decorators are **no-ops at runtime** — they exist solely as markers for the static analysis pipeline in `@formspec/build`.

## Core Type System (`@formspec/core`)

### Form Elements

All form elements implement a discriminated union on `_type`:

| Element | `_type` | `_field` | Schema Inference |
|---------|---------|----------|-----------------|
| `TextField<N>` | `"field"` | `"text"` | `string` |
| `NumberField<N>` | `"field"` | `"number"` | `number` |
| `BooleanField<N>` | `"field"` | `"boolean"` | `boolean` |
| `StaticEnumField<N, O>` | `"field"` | `"enum"` | Union of option values |
| `DynamicEnumField<N, S>` | `"field"` | `"dynamic_enum"` | `DataSourceValueType<S>` |
| `DynamicSchemaField<N>` | `"field"` | `"dynamic_schema"` | `Record<string, unknown>` |
| `ArrayField<N, Items>` | `"field"` | `"array"` | `InferSchema<Items>[]` |
| `ObjectField<N, Props>` | `"field"` | `"object"` | `InferSchema<Props>` |
| `Group<Elements>` | `"group"` | — | Transparent (fields extracted) |
| `Conditional<K, V, Elements>` | `"conditional"` | — | Fields become optional |

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
  → generateJsonSchema(form)    // Walk elements, map field types to JSON Schema
  → generateUiSchema(form)      // Walk elements, generate JSON Forms controls + layouts
```

The JSON Schema generator maps field types directly:
- `field.text()` → `{ type: "string" }`
- `field.number()` with `min`/`max` → `{ type: "number", minimum, maximum }`
- `field.enum()` → `{ type: "string", enum: [...] }`
- `field.dynamicEnum()` → `{ type: "string", "x-formspec-source": key }`
- `group()` → Transparent in JSON Schema; becomes `GroupLayout` in UI Schema
- `when()` → Fields included unconditionally in JSON Schema; UI Schema gets `rule: { effect: "SHOW", condition: ... }`

### Decorator DSL Path (Static Analysis)

```
TypeScript source file
  ↓
createProgramContext()          // Create TS program + type checker
  ↓
analyzeClass()                  // Extract FieldInfo[] with types, decorators, JSDoc
  ├─ extractDecorators()        // Parse @Decorator() calls from AST
  ├─ resolveDecorator()         // Brand-based resolution for custom/extended decorators
  └─ extractJSDocConstraints()  // Parse /** @Minimum 0 @Maximum 100 */ tags
  ↓
generateClassSchemas()          // Convert analysis to schemas
  ├─ convertType()              // Map TS types → JSON Schema + FormSpec field type
  ├─ applyDecoratorsToSchema()  // Apply constraints to JSON Schema
  └─ createFormSpecField()      // Build UI Schema field definitions
  ↓
{ jsonSchema, uiSchema }
```

### Key Analyzer Types

```
ClassAnalysis
├── fields: FieldInfo[]
│   ├── name: string
│   ├── type: ts.Type              // Resolved TypeScript type
│   ├── optional: boolean
│   ├── decorators: DecoratorInfo[]
│   │   ├── name: string           // "Field", "Minimum", etc.
│   │   ├── args: DecoratorArg[]   // Parsed literal values
│   │   └── resolved?: ResolvedDecorator
│   │       ├── extendsBuiltin?    // "Field" (for extended decorators)
│   │       └── extensionName?     // "my-ext" (for custom decorators)
│   ├── deprecated: boolean        // From JSDoc @deprecated
│   └── defaultValue: unknown      // From property initializer
├── instanceMethods: MethodInfo[]
└── staticMethods: MethodInfo[]
```

### Nested Class Constraint Propagation

When a class field's type is another class (e.g., `address!: Address`), the type converter navigates from `ts.Type` → class declaration → `analyzeField()` on each property to extract decorator/JSDoc metadata for nested properties. This is handled by `getObjectPropertyInfos()`, a shared helper used by both the JSON Schema and UI Schema paths.

Circular references (e.g., `NodeA.sibling?: NodeB`, `NodeB.sibling?: NodeA`) are detected via visited-type sets. The JSON Schema path produces `{ type: "object" }` at the cycle point; the UI Schema path omits nested fields.

### Custom Decorator Resolution

The `@formspec/decorators` package provides factory functions for extensibility:

- **`extendDecorator("Field").as<Args>("CustomField")`** — Creates a decorator that maps to a built-in (e.g., a `CurrencyField` that extends `Field`)
- **`customDecorator("my-ext").as<Args>("Tooltip")`** — Creates a decorator that emits `x-formspec-my-ext` extension properties in JSON Schema
- **`customDecorator("my-ext").marker("Sensitive")`** — Zero-arg marker version

Detection works via **branded types** using unique symbols (`FORMSPEC_EXTENDS`, `FORMSPEC_EXTENSION`, `FORMSPEC_MARKER`). The static analyzer reads these brands from the TypeScript type system — no runtime metadata needed.

## CLI (`@formspec/cli`)

Two commands:

### `formspec generate <file> [className] [-o outDir]`

Combines static analysis with optional runtime loading:

1. Create TypeScript program context
2. Analyze decorated class (static analysis)
3. Optionally load compiled JS to resolve chain DSL FormSpec exports (runtime)
4. Generate JSON Schema + UI Schema for class fields and methods
5. Write output files

### `formspec codegen <files...> [-o output]`

Extracts type metadata from decorated classes and generates a TypeScript file that bridges static types to runtime:

1. Scan files for classes with FormSpec decorators
2. Extract `TypeMetadata` for each field (type, enum values, nullable, optional)
3. Generate `__formspec_types__.ts` with:
   - Runtime metadata patches (`__formspec_types__` property)
   - Inferred schema types (`UserFormSchema`)
   - Typed accessor functions (`getUserFormFormSpec()`)

## Constraints (`@formspec/constraints`)

Restricts which FormSpec features are allowed, configured via `.formspec.yml`:

```yaml
constraints:
  fieldTypes:
    dynamicEnum: error      # Disallow dynamic enums
    dynamicSchema: error    # Disallow dynamic schemas
  layout:
    group: off              # Allow groups
    conditionals: warn      # Warn on conditionals
    maxNestingDepth: 3      # Limit nesting
  fieldOptions:
    placeholder: off        # Allow placeholders
```

### Enforcement Layers

| Layer | Tool | When |
|-------|------|------|
| **Build-time** | `@formspec/eslint-plugin` | During linting / CI |
| **Programmatic** | `validateFormSpec()` | At runtime or in build scripts |
| **Browser** | `@formspec/constraints/browser` | In the playground |

## ESLint Plugin (`@formspec/eslint-plugin`)

### Decorator DSL Rules

| Rule | Purpose |
|------|---------|
| `decorator-field-type-mismatch` | `@Minimum`/`@Maximum` only on `number`; `@MinLength`/`@Pattern` only on `string` |
| `enum-options-match-type` | `@EnumOptions` values match the field's TypeScript union type |
| `showwhen-field-exists` | `@ShowWhen({ field: "x" })` references an existing field in the class |
| `showwhen-suggests-optional` | Fields with `@ShowWhen` should be optional (`?`) |
| `consistent-constraints` | `@Minimum ≤ @Maximum`; no conflicting bound types; no duplicate decorator + JSDoc source |
| `no-conflicting-decorators` | No `@Minimum` + `@MinLength` on the same field (implies conflicting types) |
| `no-duplicate-decorators` | No duplicate `@EnumOptions` on the same field |
| `decorator-allowed-field-types` | Restrict TypeScript types on decorated properties (configurable) |
| `prefer-custom-decorator` | Suggest project-specific decorators over built-ins (configurable) |

### Constraint DSL Rules

| Rule | Purpose |
|------|---------|
| `constraints-allowed-field-types` | `field.text()`, `field.dynamicEnum()`, etc. validated against `.formspec.yml` |
| `constraints-allowed-layouts` | `group()`, `when()` validated against `.formspec.yml` |

## Entry Points

`@formspec/build` provides three entry points for different consumers:

| Entry Point | Audience | Exports |
|-------------|----------|---------|
| `@formspec/build` | Public API | `buildFormSchemas`, `writeSchemas`, `generateSchemasFromClass`, schema generators |
| `@formspec/build/browser` | Browser (playground) | Schema generators without Node.js fs/path |
| `@formspec/build/internals` | CLI (unstable) | `createProgramContext`, `analyzeClass`, `generateClassSchemas`, codegen functions |

## Testing Strategy

### Test Layers

| Layer | Framework | Location | Purpose |
|-------|-----------|----------|---------|
| **Unit** | Vitest | `src/__tests__/*.test.ts` | Individual functions in isolation |
| **Type** | tsd | `src/__tests__/*.test-d.ts` | Type inference correctness |
| **Integration** | Vitest | `src/__tests__/integration.test.ts` | Full pipeline (DSL → schema) |
| **Fixture-based** | Vitest | `src/__tests__/decorator-pipeline.test.ts` | Real TypeScript files through the analyzer |
| **ESLint rule** | RuleTester | `src/__tests__/rules/*.test.ts` | Valid/invalid code patterns per rule |
| **Example projects** | Vitest | `examples/*/test/schemas.test.ts` | Schema snapshot validation |

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
- **Dual format**: `@formspec/decorators` publishes ESM + CommonJS
- **Pre-release**: Currently on `0.1.0-alpha.*`
- All publishable packages use `"publishConfig": { "access": "public" }`

## TypeScript Configuration

Strict mode with additional strictness flags:
- `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- `noImplicitOverride`, `noPropertyAccessFromIndexSignature`
- `verbatimModuleSyntax`, `isolatedModules`, `noEmitOnError`
- No `esModuleInterop` or `allowSyntheticDefaultImports` (library compatibility)
- Target: ES2022, Module: NodeNext
