# @formspec/decorators

Marker-only TC39 Stage 3 decorators for FormSpec CLI static analysis.

These decorators are **no-ops at runtime** — they carry zero overhead. The FormSpec CLI reads decorator names and arguments directly from the TypeScript AST, without executing your code.

## Installation

```bash
npm install @formspec/decorators
# or
pnpm add @formspec/decorators
```

## Quick Start

```typescript
import { Field, Group, Minimum, Maximum, EnumOptions } from "@formspec/decorators";

class UserForm {
  @Group("Personal Info")
  @Field({ displayName: "Full Name", placeholder: "Jane Doe" })
  name!: string;

  @Group("Personal Info")
  @Field({ displayName: "Age" })
  @Minimum(18)
  @Maximum(120)
  age?: number;

  @Field({ displayName: "Country" })
  @EnumOptions([
    { id: "us", label: "United States" },
    { id: "ca", label: "Canada" },
  ])
  country!: "us" | "ca";
}
```

Then generate schemas at build time:

```bash
formspec generate ./forms.ts UserForm -o ./generated
```

## Built-in Decorators

### Field Metadata

| Decorator            | Argument                                              | Purpose                               |
| -------------------- | ----------------------------------------------------- | ------------------------------------- |
| `@Field(opts)`       | `{ displayName, description?, placeholder?, order? }` | Display metadata for a field          |
| `@Group(name)`       | `string`                                              | Assigns the field to a named UI group |
| `@ShowWhen(cond)`    | `{ field, value }`                                    | Conditional visibility                |
| `@EnumOptions(opts)` | `EnumOptionValue[] \| Record<string, string>`         | Custom enum labels                    |

### Numeric Constraints

| Decorator              | Argument | JSON Schema Property |
| ---------------------- | -------- | -------------------- |
| `@Minimum(n)`          | `number` | `minimum`            |
| `@Maximum(n)`          | `number` | `maximum`            |
| `@ExclusiveMinimum(n)` | `number` | `exclusiveMinimum`   |
| `@ExclusiveMaximum(n)` | `number` | `exclusiveMaximum`   |

### String Constraints

| Decorator         | Argument | JSON Schema Property |
| ----------------- | -------- | -------------------- |
| `@MinLength(n)`   | `number` | `minLength`          |
| `@MaxLength(n)`   | `number` | `maxLength`          |
| `@Pattern(regex)` | `string` | `pattern`            |

## Type Inference

Several properties are inferred directly from TypeScript — no decorator needed:

| Property          | Inferred From                                                   |
| ----------------- | --------------------------------------------------------------- |
| Field type        | TS type annotation (`string`, `number`, `boolean`, union types) |
| Required/optional | `?` modifier or `T \| undefined`                                |
| Default value     | Property initializer                                            |
| Deprecated        | `@deprecated` JSDoc tag                                         |

## Extensibility API

### Extending a Built-in Decorator

Use `extendDecorator` to create a specialised version of a built-in:

```typescript
import { extendDecorator } from "@formspec/decorators";

const CurrencyField = extendDecorator("Field").as<{
  displayName: string;
  currency: string;
}>("CurrencyField");

class InvoiceForm {
  @CurrencyField({ displayName: "Amount", currency: "USD" })
  amount!: number;
}
```

The CLI treats `@CurrencyField` as an extension of `@Field` — it inherits the Field schema behaviour and adds the custom `currency` property to the output.

### Custom Decorators (with Extension Namespace)

Use `customDecorator` to create decorators for a CLI extension:

```typescript
import { customDecorator } from "@formspec/decorators";

// Parameterised — takes arguments
const Tooltip = customDecorator("my-ui-extension").as<{ text: string }>("Tooltip");

// Marker — applied directly, no arguments
const Sensitive = customDecorator("my-ui-extension").marker("Sensitive");

class ProfileForm {
  @Tooltip({ text: "Shown on hover" })
  @Field({ displayName: "Bio" })
  bio!: string;

  @Sensitive
  @Field({ displayName: "SSN" })
  ssn!: string;
}
```

The CLI emits these as `x-formspec-my-ui-extension` properties in the generated schema.

### Custom Decorators (without Extension Namespace)

For decorators that don't need a CLI extension namespace:

```typescript
import { customDecorator } from "@formspec/decorators";

const Title = customDecorator().marker("Title");

class MyForm {
  @Title
  @Field({ displayName: "Heading" })
  heading!: string;
}
```

## How It Works

1. You write decorated classes using TC39 Stage 3 decorator syntax.
2. The FormSpec CLI uses the TypeScript Compiler API to statically analyse your source files.
3. It reads decorator names and arguments from the AST — your code is never executed.
4. JSON Schema and UI Schema are generated from the AST analysis.

This means:

- No reflection metadata required
- No runtime dependencies
- Zero bundle size impact (decorators are tree-shaken as dead code)
- Works with any bundler

## TypeScript Configuration

These are standard TC39 Stage 3 decorators — no special tsconfig flags needed. Do **not** set `experimentalDecorators: true` (that enables the legacy decorator proposal).

## License

UNLICENSED
