# formspec

Umbrella package for the common FormSpec authoring and runtime APIs.

It re-exports the most commonly used pieces from:

- `@formspec/core`
- `@formspec/dsl`
- `@formspec/build`
- `@formspec/runtime`

It does not include the CLI, ESLint plugin, or language server.

## Install

```bash
pnpm add formspec
```

## Quick Start

```ts
import {
  buildFormSchemas,
  defineResolvers,
  field,
  formspec,
  group,
  is,
  type InferFormSchema,
  when,
} from "formspec";

const OrderForm = formspec(
  group(
    "Order",
    field.text("customerName", { required: true }),
    field.enum("status", ["draft", "submitted"] as const, { required: true })
  ),
  when(is("status", "submitted"), field.text("submittedBy"))
);

type OrderData = InferFormSchema<typeof OrderForm>;

const { jsonSchema, uiSchema } = buildFormSchemas(OrderForm);

const resolvers = defineResolvers(OrderForm, {});
```

## What You Get

### DSL

- `formspec`
- `field`
- `group`
- `when`
- `is`
- `formspecWithValidation`
- `validateForm`

### Build

- `buildFormSchemas`
- `generateJsonSchema`
- `generateUiSchema`
- `writeSchemas`

### Runtime

- `defineResolvers`

### Types

- `InferSchema`
- `InferFormSchema`
- core field, layout, and state types
- resolver and validation helper types

### Utilities

- `createInitialFieldState`
- `validateForm`
- `logValidationIssues`

## When To Use Individual Packages

- Use `@formspec/build` directly for `generateSchemas()`, `generateSchemasFromClass()`, `generateSchemasFromProgram()`, `buildMixedAuthoringSchemas()`, and static TypeScript analysis.
- Use `@formspec/eslint-plugin` for lint rules.
- Use `@formspec/cli` for build-time artifact generation from files.
- Use `@formspec/validator` for runtime JSON Schema validation.

## License

This package is part of the FormSpec monorepo and is released under the MIT License. See [LICENSE](./LICENSE) for details.
