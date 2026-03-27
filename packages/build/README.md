# @formspec/build

Build-time schema generation for FormSpec.

This package covers:

- Chain DSL to JSON Schema / UI Schema compilation
- Static analysis of TypeScript classes, interfaces, and type aliases with TSDoc tags
- Canonical IR generation and validation
- Extension-aware schema generation with custom vendor keywords

## Install

```bash
pnpm add @formspec/build
```

Most app code can use `formspec`, but use `@formspec/build` directly when you need static analysis or lower-level generation APIs.

## Public Entry Points

| Entry point | Purpose |
| --- | --- |
| `@formspec/build` | Public build APIs |
| `@formspec/build/browser` | Browser-safe schema generation surface |
| `@formspec/build/internals` | Unstable internal APIs used by the CLI |

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

Both chain and static generation APIs accept `extensionRegistry` and `vendorPrefix` where relevant.

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

## Main Exports

- `buildFormSchemas(form, options?)`
- `generateJsonSchema(form, options?)`
- `generateUiSchema(form)`
- `writeSchemas(form, options)`
- `generateSchemas(options)`
- `generateSchemasFromClass(options)`
- `generateJsonSchemaFromIR(ir, options?)`
- `buildMixedAuthoringSchemas(options)`
- `createExtensionRegistry(extensions)`

## License

UNLICENSED
