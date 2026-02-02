# formspec

Type-safe form specifications that compile to JSON Schema and JSON Forms UI Schema.

## Installation

```bash
npm install formspec
# or
pnpm add formspec
```

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

## Quick Start

```typescript
import { formspec, field, group, when, is, buildFormSchemas, type InferFormSchema } from "formspec";

// Define a form
const ContactForm = formspec(
  field.text("name", { label: "Name", required: true }),
  field.text("email", { label: "Email", required: true }),
  field.enum("subject", ["General", "Support", "Sales"], { label: "Subject" }),
  field.text("message", { label: "Message", required: true }),
  field.boolean("subscribe", { label: "Subscribe to newsletter" }),
);

// Infer TypeScript type from the form
type ContactData = InferFormSchema<typeof ContactForm>;
// { name: string; email: string; subject: "General" | "Support" | "Sales" | undefined; ... }

// Generate JSON Schema and UI Schema
const { jsonSchema, uiSchema } = buildFormSchemas(ContactForm);
```

## Features

### Field Types

```typescript
field.text("name", { label: "Name", required: true })
field.number("age", { label: "Age", min: 0, max: 120 })
field.boolean("active", { label: "Active" })
field.enum("status", ["draft", "published"], { label: "Status" })
field.dynamicEnum("country", "fetch_countries", { label: "Country" })
field.array("tags", field.text("tag"))
field.object("address", field.text("street"), field.text("city"))
```

### Grouping

```typescript
const Form = formspec(
  group("Personal Info",
    field.text("firstName"),
    field.text("lastName"),
  ),
  group("Contact",
    field.text("email"),
    field.text("phone"),
  ),
);
```

### Conditional Fields

```typescript
const Form = formspec(
  field.enum("type", ["personal", "business"]),
  when(is("type", "business"),
    field.text("companyName", { label: "Company Name" }),
    field.text("taxId", { label: "Tax ID" }),
  ),
);
```

### Type Inference

```typescript
// Infer the form data type
type FormData = InferFormSchema<typeof MyForm>;

// Use with form libraries
const handleSubmit = (data: FormData) => {
  // data is fully typed
};
```

### Dynamic Enums with Resolvers

```typescript
import { defineResolvers } from "formspec";

const Form = formspec(
  field.dynamicEnum("country", "fetch_countries", { label: "Country" }),
);

const resolvers = defineResolvers(Form, {
  fetch_countries: async () => ({
    options: [
      { value: "us", label: "United States" },
      { value: "ca", label: "Canada" },
    ],
    validity: "valid",
  }),
});
```

### Write Schemas to Disk

```typescript
import { writeSchemas } from "formspec";

writeSchemas(ContactForm, {
  outDir: "./generated",
  name: "contact-form",
});
// Creates: ./generated/contact-form-schema.json
//          ./generated/contact-form-uischema.json
```

## Package Structure

This umbrella package re-exports from several focused packages:

| Package | Description |
|---------|-------------|
| `@formspec/core` | Core type definitions |
| `@formspec/dsl` | DSL functions (`formspec`, `field`, `group`, `when`, `is`) |
| `@formspec/build` | Schema generators (`buildFormSchemas`, `writeSchemas`) |
| `@formspec/runtime` | Runtime helpers (`defineResolvers`) |

You can import from the umbrella package for convenience, or from individual packages for smaller bundle sizes.

## Related Packages

| Package | Description |
|---------|-------------|
| `@formspec/decorators` | Decorator-based API for class definitions |
| `@formspec/cli` | CLI tool for static analysis of decorated classes |

## License

UNLICENSED
