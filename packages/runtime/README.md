# @formspec/runtime

Runtime helpers for FormSpec - resolvers and data fetching.

## Installation

```bash
npm install @formspec/runtime
# or
pnpm add @formspec/runtime
```

> **Note:** Most users should install the `formspec` umbrella package instead, which re-exports everything from this package.

## Requirements

This package is ESM-only and requires:

```json
// package.json
{
  "type": "module"
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

## Usage

### Define Resolvers for Dynamic Enums

```typescript
import { defineResolvers } from "@formspec/runtime";
import { formspec, field } from "@formspec/dsl";

// Define a form with dynamic enum fields
const OrderForm = formspec(
  field.dynamicEnum("country", "fetch_countries", { label: "Country" }),
  field.dynamicEnum("state", "fetch_states", { label: "State" }),
);

// Define type-safe resolvers
const resolvers = defineResolvers(OrderForm, {
  fetch_countries: async () => ({
    options: [
      { value: "us", label: "United States" },
      { value: "ca", label: "Canada" },
      { value: "uk", label: "United Kingdom" },
    ],
    validity: "valid",
  }),

  fetch_states: async (params) => {
    // Params can include any context needed for the lookup (e.g. form data)
    const response = await fetch(`/api/states?country=${params?.country}`);
    const states = await response.json();
    return {
      options: states.map((s: { code: string; name: string }) => ({
        value: s.code,
        label: s.name,
      })),
      validity: "valid",
    };
  },
});

// Use the resolver
const countries = await resolvers.get("fetch_countries")();
console.log(countries.options);
// [{ value: "us", label: "United States" }, ...]
```

### Resolver Response Format

```typescript
interface FetchOptionsResponse {
  options: Array<{
    value: string;
    label: string;
  }>;
  validity: "valid" | "invalid" | "unknown";
}
```

## API Reference

### Functions

| Function | Description |
|----------|-------------|
| `defineResolvers(form, resolvers)` | Create a type-safe resolver registry |

### Types

| Type | Description |
|------|-------------|
| `Resolver` | Async function that fetches options |
| `ResolverMap<F>` | Map of data source names to resolvers |
| `ResolverRegistry<F>` | Registry with `get()` method |

## Type Safety

The `defineResolvers` function enforces that:

1. All data sources referenced in the form have corresponding resolvers
2. Resolver names match the data source IDs in the form
3. Return types match the expected `FetchOptionsResponse` format

```typescript
// TypeScript error: Missing resolver for "fetch_states"
const resolvers = defineResolvers(OrderForm, {
  fetch_countries: async () => ({ ... }),
  // Error: 'fetch_states' is required
});
```

## License

UNLICENSED
