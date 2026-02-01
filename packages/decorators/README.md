# @formspec/decorators

Decorator stubs for FormSpec CLI static analysis.

## Installation

```bash
npm install @formspec/decorators
# or
pnpm add @formspec/decorators
```

## Usage

```typescript
import { Label, Min, Max, EnumOptions, ShowWhen, Group } from '@formspec/decorators';

class UserRegistration {
  @Group("Personal Info")
  @Label("Full Name")
  name!: string;

  @Group("Personal Info")
  @Label("Age")
  @Min(18)
  @Max(120)
  age?: number;

  @Group("Preferences")
  @Label("Country")
  @EnumOptions([
    { id: "us", label: "United States" },
    { id: "ca", label: "Canada" },
    { id: "uk", label: "United Kingdom" }
  ])
  country!: "us" | "ca" | "uk";

  @Group("Preferences")
  @Label("Contact Method")
  contactMethod!: "email" | "phone";

  @ShowWhen({ field: "contactMethod", value: "email" })
  @Label("Email Address")
  email?: string;

  @ShowWhen({ field: "contactMethod", value: "phone" })
  @Label("Phone Number")
  phone?: string;
}
```

## Generating Schemas

### Build-Time Only

Generate JSON Schema and UI Schema files at build time:

```bash
formspec generate ./src/user-registration.ts UserRegistration -o ./generated
```

This outputs static JSON files to `./generated/`. No codegen step required.

### Runtime Schema Generation

If you need JSON Schema or UI Schema **at runtime in your program** (e.g., dynamic form rendering, server-side generation), you have two options:

1. **Chain DSL** - Works at runtime without any codegen step. See the [Chain DSL documentation](../dsl/README.md).

2. **Decorator DSL with codegen** - If you prefer to keep using decorated classes, run codegen to preserve type information:

```bash
# Generate type metadata file
formspec codegen ./src/forms.ts -o ./src/__formspec_types__.ts
```

```typescript
// Import the generated file at your application entry point
import './__formspec_types__.js';

// Now buildFormSchemas() has access to full type information
import { buildFormSchemas } from '@formspec/decorators';
import { UserRegistration } from './forms.js';

const { jsonSchema, uiSchema } = buildFormSchemas(UserRegistration);
// jsonSchema: { $schema: "...", type: "object", properties: {...}, required: [...] }
// uiSchema: { type: "VerticalLayout", elements: [...] }
```

Add `formspec codegen` to your build process to keep type metadata in sync.

> **Note:** If you need to work with **dynamically fetched schema data** (schemas not known at build time), use the Chain DSL. It's the only option for dynamic schemas.

### API Consistency

The `buildFormSchemas()` function provides the same return type as `@formspec/build`:

| DSL | Function | Returns |
|-----|----------|---------|
| Chain DSL | `buildFormSchemas(form)` | `{ jsonSchema, uiSchema }` |
| Decorator DSL | `buildFormSchemas(Class)` | `{ jsonSchema, uiSchema }` |

This allows you to switch between DSLs without changing how you consume the schemas.

## How It Works

These decorators are **no-ops at runtime** - they have zero overhead in your production code.

The FormSpec CLI uses TypeScript's compiler API to statically analyze your source files. It reads decorator names and arguments directly from the AST, without ever executing your code.

This means:
- No reflection metadata required
- No runtime dependencies
- Works with any TypeScript configuration
- Tree-shaking friendly

## Available Decorators

### Field Metadata

| Decorator | Purpose | Example |
|-----------|---------|---------|
| `@Label(text)` | Display label | `@Label("Full Name")` |
| `@Placeholder(text)` | Input placeholder | `@Placeholder("Enter name...")` |
| `@Description(text)` | Help text | `@Description("Your legal name")` |

### Numeric Constraints

| Decorator | Purpose | Example |
|-----------|---------|---------|
| `@Min(n)` | Minimum value | `@Min(0)` |
| `@Max(n)` | Maximum value | `@Max(100)` |
| `@Step(n)` | Step increment | `@Step(0.01)` |

### String Constraints

| Decorator | Purpose | Example |
|-----------|---------|---------|
| `@MinLength(n)` | Minimum length | `@MinLength(1)` |
| `@MaxLength(n)` | Maximum length | `@MaxLength(255)` |
| `@Pattern(regex)` | Regex pattern | `@Pattern("^[a-z]+$")` |

### Array Constraints

| Decorator | Purpose | Example |
|-----------|---------|---------|
| `@MinItems(n)` | Minimum items | `@MinItems(1)` |
| `@MaxItems(n)` | Maximum items | `@MaxItems(10)` |

### Enum Options

| Decorator | Purpose | Example |
|-----------|---------|---------|
| `@EnumOptions(opts)` | Custom labels | `@EnumOptions([{id: "us", label: "USA"}])` |

### Layout & Conditional

| Decorator | Purpose | Example |
|-----------|---------|---------|
| `@Group(name)` | Group fields | `@Group("Contact Info")` |
| `@ShowWhen(cond)` | Conditional visibility | `@ShowWhen({ field: "type", value: "other" })` |

## TypeScript Configuration

For decorator support, ensure your `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

Note: The `emitDecoratorMetadata` flag is not required since these decorators don't use reflection.

## License

UNLICENSED
