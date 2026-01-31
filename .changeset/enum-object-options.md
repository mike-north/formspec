---
"@formspec/core": minor
"@formspec/dsl": minor
"@formspec/build": minor
---

Add support for object-based enum options with separate id and label

Enum fields can now use object options with `id` and `label` properties, allowing the stored value to differ from the display text.

### New types

- `EnumOption` - Interface for object-based enum options with `id` and `label`
- `EnumOptionValue` - Union type accepting both string and object options

### Usage

```typescript
// String options (existing behavior)
field.enum("status", ["draft", "sent", "paid"])

// Object options (new)
field.enum("priority", [
  { id: "low", label: "Low Priority" },
  { id: "high", label: "High Priority" },
])
```

### JSON Schema generation

Object-based enum options generate `oneOf` schemas with `const` and `title` properties instead of the `enum` keyword, preserving both the value and display label in the schema.
