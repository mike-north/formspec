# Experiment: Decorator-based FormSpec DSL

This experiment provides a decorator-based alternative to the FormSpec DSL that allows defining forms by annotating TypeScript class properties.

## Prerequisites

- TypeScript 5.0 or later
- Node.js 20 or later (for TC39 Stage 3 decorator support)
- `experimentalDecorators` must NOT be enabled in tsconfig.json

## Installation

This is an experimental package in the formspec workspace:

```bash
# From workspace root
pnpm install
```

## Features

- **TC39 Stage 3 Decorators**: Uses modern JavaScript decorators (TypeScript 5.0+)
- **Type-safe**: Leverages TypeScript's type system for compile-time validation
- **Schema Inference**: Automatically infers form data types from class definitions
- **Runtime Conversion**: Converts decorated classes to FormSpec at runtime
- **Full FormSpec Support**: Supports fields, groups, conditionals, and more

## Usage

### Basic Example

```typescript
import { FormClass, Label, Optional, Min, Max, toFormSpec } from '@formspec/exp-decorators';

@FormClass()
class UserForm {
  @Label("Full Name")
  name!: string;

  @Label("Age")
  @Min(0)
  @Max(120)
  @Optional()
  age?: number;

  @Label("Email")
  email!: string;
}

// Convert to FormSpec
const spec = toFormSpec(UserForm);

// Infer schema type
import type { InferClassSchema } from '@formspec/exp-decorators';
type UserSchema = InferClassSchema<UserForm>;
// Result: { name: string; age?: number; email: string }
```

### Available Decorators

#### Class Decorators

- `@FormClass()` - Marks a class as a form definition

#### Field Decorators

- `@Label(text)` - Sets the display label
- `@Optional()` - Marks a field as optional (default: all fields required)
- `@Placeholder(text)` - Sets placeholder text (text fields)
- `@Min(value)` - Sets minimum value (number fields)
- `@Max(value)` - Sets maximum value (number fields)
- `@EnumOptions(options)` - Defines enum options (strings or `{id, label}` objects)
- `@Group(name)` - Assigns field to a named group
- `@ShowWhen(predicate)` - Conditional visibility
- `@MinItems(count)` - Minimum array items
- `@MaxItems(count)` - Maximum array items

### Enums

Enum options can be plain strings or objects with `id` and `label`:

```typescript
@FormClass()
class PreferencesForm {
  // String options
  @EnumOptions(["small", "medium", "large"] as const)
  size!: "small" | "medium" | "large";

  // Object options with labels
  @EnumOptions([
    { id: "light", label: "Light Mode" },
    { id: "dark", label: "Dark Mode" },
  ] as const)
  theme!: string;
}
```

### Groups

Fields with the same group name are rendered together:

```typescript
@FormClass()
class ProfileForm {
  @Group("Personal Information")
  @Label("First Name")
  firstName!: string;

  @Group("Personal Information")
  @Label("Last Name")
  lastName!: string;

  @Group("Contact Information")
  @Label("Email")
  email!: string;
}
```

### Conditional Fields

Use `@ShowWhen()` to show fields conditionally:

```typescript
@FormClass()
class PaymentForm {
  @Label("Payment Method")
  @EnumOptions(["credit_card", "paypal"] as const)
  paymentMethod!: "credit_card" | "paypal";

  @Label("Card Number")
  @ShowWhen({ _predicate: "equals", field: "paymentMethod", value: "credit_card" })
  cardNumber?: string;
}
```

> **Note**: The `@ShowWhen` decorator accepts a predicate object directly, not the `is()` helper function used in the builder DSL.

## Type Inference

The `InferClassSchema<T>` utility type extracts the data schema from a decorated class:

```typescript
@FormClass()
class MyForm {
  name!: string;
  age?: number;
  tags!: string[];
}

type Schema = InferClassSchema<MyForm>;
// Result: { name: string; age?: number; tags: string[] }
```

## Implementation Details

### Metadata Storage

The decorators use WeakMap-based storage to associate metadata with class constructors:

- Field metadata is stored per-class, per-property
- Decorators merge metadata (e.g., multiple decorators on same field)
- WeakMap ensures garbage collection when classes are no longer referenced

### Runtime Type Detection

Since TypeScript types are erased at runtime, the decorators provide type hints:

- `@Min/@Max` hints "number" field type
- `@Placeholder` hints "text" field type
- `@EnumOptions` hints "enum" field type
- Default: text field

### TC39 Stage 3 Decorators

This experiment uses modern TC39 Stage 3 decorators, not legacy experimental decorators:

- Field decorators receive `(target: undefined, context: ClassFieldDecoratorContext)`
- Metadata is accessed via `context.metadata`
- More predictable behavior and better alignment with JavaScript standards

## Limitations (POC)

This is a proof-of-concept with some limitations:

1. **Array/Object Nesting**: Array items and object properties need separate decorator support
2. **Runtime Type Inference**: Cannot automatically detect types without decorator hints
3. **Conditional Grouping**: Conditionals around grouped fields not fully supported
4. **Dynamic Enums**: Only static enum options currently supported

## See Also

- [TC39 Decorators Proposal](https://github.com/tc39/proposal-decorators)
- [TypeScript 5.0 Decorators](https://www.typescriptlang.org/docs/handbook/decorators.html)
- [FormSpec Core Types](../../packages/core)
