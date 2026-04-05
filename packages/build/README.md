# @formspec/build

Build-time schema generation for FormSpec.

This package covers:

- Chain DSL to JSON Schema / UI Schema compilation
- Static analysis of TypeScript classes, interfaces, and type aliases with TSDoc tags
- Mixed-authoring schema generation
- Extension-aware schema generation with custom vendor keywords

## Install

```bash
pnpm add @formspec/build
```

Most app code can use `formspec`, but use `@formspec/build` directly when you need static analysis or lower-level generation APIs.

## Public Entry Points

| Entry point                 | Purpose                                |
| --------------------------- | -------------------------------------- |
| `@formspec/build`           | Public build APIs                      |
| `@formspec/build/browser`   | Browser-safe chain-DSL and IR surface  |
| `@formspec/build/internals` | Unstable low-level IR/analyzer APIs    |

## Chain DSL Generation

```ts
import { buildFormSchemas } from "@formspec/build";
import { field, formspec } from "@formspec/dsl";

const form = formspec(
  field.text("name", { required: true }),
  field.enum("status", ["draft", "published"] as const)
);

const { jsonSchema, uiSchema } = buildFormSchemas(form);
```

## Static Analysis

`generateSchemas()` is the main entry point for TSDoc-backed generation.

```ts
import { generateSchemas } from "@formspec/build";

const { jsonSchema, uiSchema } = generateSchemas({
  filePath: "./src/forms.ts",
  typeName: "ProductConfig",
});
```

`generateSchemasFromClass()` remains available when the input is definitely a class declaration.

```ts
import { generateSchemasFromClass } from "@formspec/build";

const result = generateSchemasFromClass({
  filePath: "./src/forms.ts",
  className: "ProductConfig",
});
```

### Supported TSDoc Examples

```ts
export interface ProductConfig {
  /** @displayName Product Name @minLength 1 */
  name: string;

  /** @format email */
  supportEmail?: string;

  /** @placeholder Search products */
  query?: string;

  /** @minimum 0 @maximum 9999.99 */
  price: number;

  /** @uniqueItems */
  tags: string[];
}
```

## Extension-Aware Generation

Static-analysis and mixed-authoring generation APIs accept `extensionRegistry` and `vendorPrefix`. Chain DSL generation accepts `vendorPrefix`, but not `extensionRegistry`.

```ts
import { createExtensionRegistry, generateSchemas } from "@formspec/build";

const registry = createExtensionRegistry([myExtension]);

const result = generateSchemas({
  filePath: "./src/forms.ts",
  typeName: "Invoice",
  extensionRegistry: registry,
  vendorPrefix: "x-acme",
});
```

Generation validates canonical IR before emitting schemas. Invalid inputs now fail generation with structured diagnostic codes surfaced in the thrown error.

## Internal Entry Point

Low-level canonical IR generators, analyzer primitives, and validation helpers are intentionally no longer exported from the package root. If you need those unstable internals inside the monorepo, import them from `@formspec/build/internals`.

## Main Exports

- `buildFormSchemas(form, options?)`
- `generateJsonSchema(form, options?)`
- `generateUiSchema(form)`
- `writeSchemas(form, options)`
- `generateSchemas(options)`
- `generateSchemasFromClass(options)`
- `generateSchemasFromProgram(options)`
- `buildMixedAuthoringSchemas(options)`
- `createExtensionRegistry(extensions)`

`writeSchemas()` is the chain-DSL convenience wrapper for writing emitted files. Extension registries apply to the static-analysis and mixed-authoring generation flows above, not to `writeSchemas()`.

## License

This package is part of the FormSpec monorepo and is released under the MIT License. See the repository root `LICENSE` file for details.
