# @formspec/cli

CLI tool for generating JSON Schema and JSON Forms UI Schema from TypeScript source files.

## Installation

```bash
npm install -D @formspec/cli
# or
pnpm add -D @formspec/cli
```

## Requirements

**Package configuration** (package.json):

```json
{
  "type": "module"
}
```

**TypeScript configuration** (tsconfig.json):

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

## Quick Start

```bash
# Generate schemas from a TypeScript class with JSDoc constraints
formspec generate ./src/forms.ts UserForm -o ./generated

# Generate schemas from chain DSL exports
formspec generate ./src/forms.ts -o ./generated

# Output Canonical IR instead of schemas
formspec generate ./src/forms.ts UserForm --emit-ir -o ./generated

# Validate without writing files
formspec generate ./src/forms.ts UserForm --validate-only
```

## Commands

### `generate` — Build-time Schema Generation

Generate JSON Schema and UI Schema files from TypeScript source files.

```
formspec generate <file> [className] [options]
```

**Arguments:**

- `<file>` — Path to TypeScript source file
- `[className]` — Optional class or type name to analyze

**Options:**

| Option | Description | Default |
| --- | --- | --- |
| `-o, --output <dir>` | Output directory | `./generated` |
| `-c, --compiled <path>` | Path to compiled JS file | auto-detected |
| `--emit-ir` | Output Canonical IR as JSON | |
| `--validate-only` | Validate input without writing files | |
| `-h, --help` | Show help message | |

**Examples:**

```bash
# Generate from a class with JSDoc constraint tags
formspec generate ./src/forms.ts UserForm -o ./generated

# Generate from chain DSL exports (requires compiled JS)
tsc && formspec generate ./src/forms.ts -o ./generated

# Inspect Canonical IR
formspec generate ./src/forms.ts UserForm --emit-ir

# Validate only (no file output)
formspec generate ./src/forms.ts UserForm --validate-only
```

## JSDoc Constraint Tags

The CLI performs static analysis of TypeScript source files. It reads type information directly from the TypeScript compiler and extracts constraint metadata from JSDoc tags:

```typescript
class UserRegistration {
  /** @DisplayName Full Name */
  name!: string;

  /** @DisplayName Email Address */
  email!: string;

  /**
   * @DisplayName Age
   * @Minimum 18
   * @Maximum 120
   */
  age?: number;

  /** @DisplayName Country */
  country!: "us" | "ca" | "uk";
}
```

```bash
formspec generate ./src/user-registration.ts UserRegistration -o ./generated
```

### Supported Tags

| Tag | Purpose | Example |
| --- | --- | --- |
| `@DisplayName` | Set field label | `/** @DisplayName Full Name */` |
| `@Description` | Set field description | `/** @Description Your legal name */` |
| `@Placeholder` | Set placeholder text | `/** @Placeholder Enter name... */` |
| `@Minimum` | Set minimum value | `/** @Minimum 0 */` |
| `@Maximum` | Set maximum value | `/** @Maximum 100 */` |
| `@ExclusiveMinimum` | Set exclusive minimum | `/** @ExclusiveMinimum 0 */` |
| `@ExclusiveMaximum` | Set exclusive maximum | `/** @ExclusiveMaximum 100 */` |
| `@MinLength` | Set minimum string length | `/** @MinLength 1 */` |
| `@MaxLength` | Set maximum string length | `/** @MaxLength 255 */` |
| `@Pattern` | Set validation regex | `/** @Pattern ^[a-z]+$ */` |
| `@EnumOptions` | Override enum display | `/** @EnumOptions [{"id":"us","label":"US"}] */` |

### Type Inference

The CLI automatically infers JSON Schema types from TypeScript:

| TypeScript Type | JSON Schema | FormSpec Field |
| --- | --- | --- |
| `string` | `{ "type": "string" }` | text |
| `number` | `{ "type": "number" }` | number |
| `boolean` | `{ "type": "boolean" }` | boolean |
| `"a" \| "b"` | `{ "enum": ["a", "b"] }` | enum |
| `string[]` | `{ "type": "array", "items": {...} }` | array |
| `{ a: string }` | `{ "type": "object", "properties": {...} }` | object |
| `field?: T` | not in `required` array | optional |

## Chain DSL Support

The CLI also supports FormSpec chain DSL exports:

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

The CLI detects `InferSchema<typeof X>` or `InferFormSchema<typeof X>` patterns in method parameters:

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

## Output Structure

```
generated/
├── ClassName/
│   ├── schema.json
│   ├── uischema.json
│   ├── instance_methods/
│   │   └── methodName/
│   │       ├── params.schema.json
│   │       └── return_type.schema.json
│   └── static_methods/
│       └── methodName/
│           └── ...
└── formspecs/
    └── ExportName/
        ├── schema.json
        └── uischema.json
```

## Troubleshooting

### "Could not load compiled module" Warning

This warning appears when the CLI cannot find a compiled JavaScript version of your TypeScript file. The CLI still works — it uses static TypeScript analysis which doesn't require compiled output.

To suppress the warning, compile your TypeScript first:

```bash
tsc
formspec generate ./src/forms.ts MyClass -o ./generated
```

## License

UNLICENSED
