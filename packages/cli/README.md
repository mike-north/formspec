# @formspec/cli

CLI tool for generating JSON Schema and FormSpec UX specs from TypeScript source files.

## Installation

```bash
npm install @formspec/cli
# or
pnpm add @formspec/cli
```

## Quick Start

```bash
# Generate schemas from a TypeScript class
formspec generate ./src/forms.ts MyClass -o ./generated

# Generate schemas from all FormSpec exports in a file (chain DSL)
formspec generate ./src/forms.ts -o ./generated
```

## Features

### Static Type Analysis

The CLI uses the TypeScript Compiler API to statically analyze your source files. It automatically infers:

| TypeScript Type | JSON Schema | FormSpec Field |
|-----------------|-------------|----------------|
| `string` | `{ "type": "string" }` | `{ "_field": "text" }` |
| `number` | `{ "type": "number" }` | `{ "_field": "number" }` |
| `boolean` | `{ "type": "boolean" }` | `{ "_field": "boolean" }` |
| `"a" \| "b" \| "c"` | `{ "enum": ["a", "b", "c"] }` | `{ "_field": "enum", "options": [...] }` |
| `string[]` | `{ "type": "array", "items": {...} }` | `{ "_field": "array" }` |
| `{ a: string }` | `{ "type": "object", "properties": {...} }` | `{ "_field": "object" }` |
| `field?: T` | not in `required` array | `{ "required": false }` |

### Decorator Recognition

The CLI recognizes decorators by name through static analysis. You don't need a specific decorator library - any decorator with a recognized name will work.

#### Supported Decorators

| Decorator | Purpose | Example |
|-----------|---------|---------|
| `@Label(text)` | Set field label | `@Label("Full Name")` |
| `@Placeholder(text)` | Set placeholder text | `@Placeholder("Enter name...")` |
| `@Description(text)` | Set field description | `@Description("Your legal name")` |
| `@Min(n)` | Set minimum value | `@Min(0)` |
| `@Max(n)` | Set maximum value | `@Max(100)` |
| `@MinLength(n)` | Set minimum string length | `@MinLength(1)` |
| `@MaxLength(n)` | Set maximum string length | `@MaxLength(255)` |
| `@MinItems(n)` | Set minimum array items | `@MinItems(1)` |
| `@MaxItems(n)` | Set maximum array items | `@MaxItems(10)` |
| `@Pattern(regex)` | Set validation pattern | `@Pattern("^[a-z]+$")` |
| `@EnumOptions(opts)` | Override enum options | `@EnumOptions([{id: "us", label: "United States"}])` |
| `@ShowWhen(cond)` | Conditional visibility | `@ShowWhen({ field: "type", value: "other" })` |
| `@Group(name)` | Group fields together | `@Group("Contact Info")` |

#### Using Decorators

Install the `@formspec/decorators` package:

```bash
npm install @formspec/decorators
```

Then use the decorators in your class:

```typescript
// user-registration.ts
import { Label, Min, Max, EnumOptions } from "@formspec/decorators";

class UserRegistration {
  @Label("Full Name")
  name!: string;

  @Label("Email Address")
  email!: string;

  @Label("Age")
  @Min(18)
  @Max(120)
  age?: number;

  @Label("Country")
  @EnumOptions([
    { id: "us", label: "United States" },
    { id: "ca", label: "Canada" },
    { id: "uk", label: "United Kingdom" },
  ])
  country!: "us" | "ca" | "uk";
}
```

Run the CLI:

```bash
formspec generate ./src/user-registration.ts UserRegistration -o ./generated
```

> **Note**: The decorators are no-ops at runtime with zero overhead. The CLI reads them through static analysis of your TypeScript source code.

### FormSpec Chain DSL Support

The CLI also supports the FormSpec chain DSL. Export your FormSpec definitions and the CLI will generate schemas for them:

```typescript
// forms.ts
import { formspec, field } from "@formspec/dsl";

export const ContactForm = formspec(
  field.text("name", { label: "Name", required: true }),
  field.text("email", { label: "Email", required: true }),
  field.text("message", { label: "Message" })
);
```

```bash
formspec generate ./src/forms.ts -o ./generated
```

### Method Parameter Analysis

The CLI can detect `InferSchema<typeof X>` or `InferFormSchema<typeof X>` patterns in method parameters and use the referenced FormSpec to generate parameter schemas:

```typescript
import { formspec, field, type InferFormSchema } from "@formspec/dsl";

export const ActivateParams = formspec(
  field.number("amount", { label: "Amount", min: 100 }),
  field.number("installments", { min: 2, max: 12 })
);

class PaymentPlan {
  status!: "active" | "paused" | "canceled";

  activate(params: InferFormSchema<typeof ActivateParams>): boolean {
    // ...
  }
}
```

The CLI will generate schemas for both the class fields and the method parameters.

## Output Structure

```
generated/
├── ClassName/
│   ├── schema.json           # JSON Schema for class fields
│   ├── ux_spec.json          # FormSpec UX spec for form rendering
│   ├── instance_methods/
│   │   └── methodName/
│   │       ├── params.schema.json
│   │       ├── params.ux_spec.json  # (if FormSpec-based params)
│   │       └── return_type.schema.json
│   └── static_methods/
│       └── methodName/
│           └── ...
└── formspecs/
    └── ExportName/
        ├── schema.json
        └── ux_spec.json
```

## Example Output

Given this TypeScript class:

```typescript
import { Label, Min, Max, EnumOptions } from "@formspec/decorators";

class ContactForm {
  @Label("Full Name")
  name!: string;

  @Label("Email Address")
  email!: string;

  @Label("Age")
  @Min(18)
  @Max(120)
  age?: number;

  @Label("Country")
  @EnumOptions([
    { id: "us", label: "United States" },
    { id: "ca", label: "Canada" }
  ])
  country!: "us" | "ca";
}
```

Running `formspec generate ./contact-form.ts ContactForm` produces:

**schema.json:**
```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string", "title": "Full Name" },
    "email": { "type": "string", "title": "Email Address" },
    "age": { "type": "number", "title": "Age", "minimum": 18, "maximum": 120 },
    "country": {
      "oneOf": [
        { "const": "us", "title": "United States" },
        { "const": "ca", "title": "Canada" }
      ]
    }
  },
  "required": ["name", "email", "country"]
}
```

**ux_spec.json:**
```json
{
  "elements": [
    { "_field": "text", "id": "name", "label": "Full Name", "required": true },
    { "_field": "text", "id": "email", "label": "Email Address", "required": true },
    { "_field": "number", "id": "age", "label": "Age", "min": 18, "max": 120 },
    {
      "_field": "enum",
      "id": "country",
      "label": "Country",
      "required": true,
      "options": [
        { "id": "us", "label": "United States" },
        { "id": "ca", "label": "Canada" }
      ]
    }
  ]
}
```

## CLI Reference

```
formspec generate <file> [className] [options]

Arguments:
  <file>        Path to TypeScript source file
  [className]   Optional class name (if omitted, generates from FormSpec exports only)

Options:
  -o, --output <dir>    Output directory (default: ./generated)
  -c, --compiled <path> Path to compiled JS file (auto-detected if omitted)
  -h, --help            Show help message

Aliases:
  formspec analyze      Same as 'generate' (backwards compatibility)
```

## TypeScript Configuration

For decorator support, ensure your `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

> **Note**: The `emitDecoratorMetadata` flag is not required. The CLI performs static analysis and reads decorators directly from the AST without using reflection.

## Troubleshooting

### "Could not load compiled module" Warning

This warning appears when the CLI cannot find a compiled JavaScript version of your TypeScript file. This is expected if you haven't compiled your TypeScript yet.

**The CLI will still work** - it uses static TypeScript analysis which doesn't require compiled output. The warning only affects method parameters that use `InferSchema<typeof X>`, which require the FormSpec to be loaded at runtime.

To suppress this warning, compile your TypeScript first:

```bash
tsc
formspec generate ./src/forms.ts MyClass -o ./generated
```

### Decorators Not Being Recognized

Ensure:
1. Decorator names match exactly (case-sensitive): `@Label`, not `@label`
2. Decorators are function calls: `@Label("text")`, not `@Label`
3. The decorator is imported (even if it's a stub)

## License

UNLICENSED
