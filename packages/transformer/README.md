# @formspec/transformer

> **Note:** For most use cases, consider using `formspec codegen` instead. It provides the same functionality without requiring ts-patch. See [@formspec/decorators](../decorators/README.md) for the recommended approach.

TypeScript transformer that enables runtime access to full type information for FormSpec decorated classes.

## The Problem

TypeScript types are erased at runtime. When you write:

```typescript
class MyForm {
  country!: "us" | "ca" | "uk";
}
```

At runtime, there's no way to know that `country` is a union of string literals. The type information is gone.

## The Solution

This transformer runs at compile time and emits type metadata as a static property:

```typescript
// Input (your source code)
class MyForm {
  @Label("Country")
  country!: "us" | "ca" | "uk";
}

// Output (after compilation with transformer)
class MyForm {
  static __formspec_types__ = {
    country: { type: "enum", values: ["us", "ca", "uk"] }
  };

  @Label("Country")
  country!: "us" | "ca" | "uk";
}
```

Now `@formspec/decorators` can read this metadata at runtime via `toFormSpec()`.

## Installation

```bash
npm install @formspec/transformer typescript ts-patch
# or
pnpm add @formspec/transformer typescript ts-patch
```

## Setup

### 1. Patch TypeScript

The transformer uses [ts-patch](https://github.com/nonara/ts-patch) to integrate with the TypeScript compiler:

```bash
npx ts-patch install
```

This patches your local TypeScript installation to support compiler plugins.

### 2. Configure tsconfig.json

Add the transformer to your compiler plugins:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "plugins": [
      { "transform": "@formspec/transformer" }
    ]
  }
}
```

### 3. Compile with tsc

Now when you run `tsc`, the transformer will automatically add type metadata to decorated classes:

```bash
npx tsc
```

## Usage with @formspec/decorators

Once compiled with the transformer, use `toFormSpec()` to generate specs at runtime:

```typescript
import { Label, Min, Max, EnumOptions, toFormSpec } from "@formspec/decorators";

class UserRegistration {
  @Label("Full Name")
  name!: string;

  @Label("Age")
  @Min(18)
  @Max(120)
  age?: number;

  @Label("Country")
  @EnumOptions([
    { id: "us", label: "United States" },
    { id: "ca", label: "Canada" },
  ])
  country!: "us" | "ca";
}

// Generate FormSpec at runtime
const spec = toFormSpec(UserRegistration);

console.log(JSON.stringify(spec, null, 2));
// {
//   "elements": [
//     { "_field": "text", "id": "name", "label": "Full Name", "required": true },
//     { "_field": "number", "id": "age", "label": "Age", "min": 18, "max": 120 },
//     { "_field": "enum", "id": "country", "label": "Country", "required": true,
//       "options": [{ "id": "us", "label": "United States" }, { "id": "ca", "label": "Canada" }] }
//   ]
// }
```

## Supported Types

The transformer extracts metadata for these TypeScript patterns:

| TypeScript Type | Metadata |
|-----------------|----------|
| `string` | `{ type: "string" }` |
| `number` | `{ type: "number" }` |
| `boolean` | `{ type: "boolean" }` |
| `"a" \| "b" \| "c"` | `{ type: "enum", values: ["a", "b", "c"] }` |
| `1 \| 2 \| 3` | `{ type: "enum", values: [1, 2, 3] }` |
| `string[]` | `{ type: "array", itemType: { type: "string" } }` |
| `{ a: string }` | `{ type: "object", properties: { a: { type: "string" } } }` |
| `field?: T` | `{ ..., optional: true }` |
| `T \| null` | `{ ..., nullable: true }` |

### Unsupported Types

Some TypeScript patterns are not fully supported:

| TypeScript Type | Result |
|-----------------|--------|
| Intersection types (`A & B`) | `{ type: "unknown" }` |
| Complex unions (`string \| number`) | `{ type: "unknown" }` |
| Recursive types (`Node { children: Node[] }`) | Recursive reference becomes `{ type: "unknown" }` |
| Mapped types, conditional types | `{ type: "unknown" }` |

The transformer handles these gracefully - unsupported types are marked as `"unknown"` rather than causing errors. You can still use `@formspec/decorators` to provide explicit configuration for these fields.

## How It Works

1. **Transformer detects decorated classes**: Only classes with decorated properties are transformed
2. **Type checker extracts types**: The TypeScript type checker provides full type information
3. **Metadata is serialized**: Types are converted to a JSON-serializable format
4. **Static property is added**: The `__formspec_types__` property is injected into the class

The transformer only runs on classes that have at least one decorated property, so there's no performance impact on unrelated code.

**Note:** The transformer activates on *any* decorated property, not just `@formspec/decorators`. If a property has any decorator (e.g., `@observable`, `@inject`), type metadata will be extracted for the entire class. This is intentional - it allows FormSpec to work alongside other decorator-based libraries.

## Build-Time vs Runtime

FormSpec now supports both approaches:

| Approach | When to Use |
|----------|-------------|
| **Build-time (CLI)** | CI/CD pipelines, static schema generation, no runtime dependency |
| **Runtime (transformer)** | Dynamic forms, server-side rendering, form composition |

You can use both in the same project - the CLI for generating static schemas and the transformer for runtime flexibility.

## Troubleshooting

### "Plugin not found" error

Make sure you've run `npx ts-patch install` after installing or updating TypeScript.

**Important:** ts-patch modifies your local TypeScript installation. You must re-run `npx ts-patch install` after:
- Running `npm install` or `pnpm install` (which may reinstall TypeScript)
- Updating your TypeScript version
- Deleting and recreating `node_modules`

### Types not being extracted

1. Ensure the class has at least one decorated property
2. Check that `experimentalDecorators` is enabled in tsconfig.json
3. Verify the transformer is listed in `compilerOptions.plugins`

### Using with bundlers

Most bundlers (webpack, rollup, esbuild) use their own TypeScript compilation. You may need to:
- Configure the bundler to use `tsc` for TypeScript compilation
- Or use a bundler plugin that supports ts-patch

## License

UNLICENSED
