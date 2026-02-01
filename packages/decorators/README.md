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

Then generate schemas:

```bash
formspec generate ./src/user-registration.ts UserRegistration -o ./generated
```

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
