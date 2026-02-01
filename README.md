# FormSpec

Type-safe form specifications that compile to JSON Schema and JSON Forms UI Schema.

## Overview

FormSpec is a TypeScript library that lets you define forms using a declarative DSL, then compile them to standard JSON Schema and JSON Forms UI Schema. The key benefits are:

- **Type Safety**: Full TypeScript inference from form definition to schema type
- **Single Source of Truth**: One form definition generates both data schema and UI layout
- **Conditional Logic**: Built-in support for showing/hiding fields based on other field values
- **Dynamic Data**: Support for dynamic enums (fetched at runtime) and dynamic schemas
- **Nested Structures**: Full support for objects, arrays, and deeply nested compositions

## Installation

```bash
npm install formspec
# or
pnpm add formspec
# or
yarn add formspec
```

## Quick Start

```typescript
import { formspec, field, group, when, is, buildFormSchemas } from "formspec";
import type { InferFormSchema } from "formspec";

// Define your form
const ContactForm = formspec(
  group("Personal Info",
    field.text("name", { label: "Full Name", required: true }),
    field.text("email", { label: "Email", required: true }),
  ),
  group("Preferences",
    field.enum("contactMethod", ["email", "phone", "mail"], {
      label: "Preferred Contact Method",
    }),
    when(is("contactMethod", "phone"),
      field.text("phoneNumber", { label: "Phone Number" }),
    ),
  ),
);

// Infer the TypeScript type
type ContactSchema = InferFormSchema<typeof ContactForm>;
// { name: string; email: string; contactMethod: "email" | "phone" | "mail"; phoneNumber: string }

// Generate JSON Schema and UI Schema
const { jsonSchema, uiSchema } = buildFormSchemas(ContactForm);
```

## Field Types

### Basic Fields

```typescript
// Text input
field.text("name", { label: "Name", placeholder: "Enter name", required: true })

// Number input
field.number("age", { label: "Age", min: 0, max: 150 })

// Boolean checkbox
field.boolean("subscribe", { label: "Subscribe to newsletter" })

// Static enum (dropdown/radio)
field.enum("status", ["draft", "published", "archived"], { label: "Status" })
```

### Dynamic Fields

```typescript
// Dynamic enum - options fetched at runtime
// Second argument is the resolver identifier (maps to a resolver defined with defineResolvers)
field.dynamicEnum("country", "fetch_countries", { label: "Country" })

// Dynamic enum with dependencies
field.dynamicEnum("city", "fetch_cities", {
  label: "City",
  params: ["country"], // city options depend on selected country
})
```

### Complex Fields

```typescript
// Object field - nested properties under a single key
field.object("address",
  field.text("street", { label: "Street" }),
  field.text("city", { label: "City" }),
  field.text("zip", { label: "ZIP Code" }),
)

// Array field - repeating items
field.array("contacts",
  field.text("name", { label: "Contact Name" }),
  field.text("email", { label: "Email" }),
)

// Array with constraints
field.arrayWithConfig("lineItems", { label: "Line Items", minItems: 1, maxItems: 20 },
  field.text("description"),
  field.number("quantity", { min: 1 }),
  field.number("price", { min: 0 }),
)
```

## Structure Elements

### Groups

Groups provide visual organization without affecting the schema structure:

```typescript
const form = formspec(
  group("Customer Information",
    field.text("name"),
    field.text("email"),
  ),
  group("Order Details",
    field.number("quantity"),
    field.number("total"),
  ),
);
```

### Conditionals

Show/hide fields based on other field values:

```typescript
const form = formspec(
  field.enum("paymentMethod", ["card", "bank", "crypto"]),

  when(is("paymentMethod", "card"),
    field.text("cardNumber", { label: "Card Number" }),
    field.text("cvv", { label: "CVV" }),
  ),

  when(is("paymentMethod", "bank"),
    field.text("accountNumber", { label: "Account Number" }),
    field.text("routingNumber", { label: "Routing Number" }),
  ),
);
```

Conditionals can be nested for complex logic:

```typescript
when(is("country", "US"),
  field.text("ssn", { label: "SSN" }),
  when(is("paymentMethod", "bank"),
    field.text("routingNumber", { label: "Routing Number" }),
  ),
)
```

## Dynamic Data with Resolvers

Define resolvers for dynamic enum fields:

```typescript
import { defineResolvers } from "formspec";

const resolvers = defineResolvers(ContactForm, {
  fetch_countries: async () => ({
    options: [
      { value: "us", label: "United States" },
      { value: "ca", label: "Canada" },
      { value: "gb", label: "United Kingdom" },
    ],
    validity: "valid",
  }),

  fetch_cities: async (params) => {
    const country = params.country;
    const cities = await fetchCitiesForCountry(country);
    return {
      options: cities.map(c => ({ value: c.id, label: c.name })),
      validity: "valid",
    };
  },
});
```

## Type Inference

FormSpec provides full type inference:

```typescript
import type { InferSchema, InferFormSchema } from "formspec";

const form = formspec(
  field.text("name"),
  field.number("age"),
  field.enum("role", ["admin", "user"]),
  field.object("address",
    field.text("city"),
    field.text("country"),
  ),
  field.array("tags",
    field.text("tag"),
  ),
);

// Infer from elements
type Schema = InferSchema<typeof form.elements>;

// Or infer from entire form
type Schema2 = InferFormSchema<typeof form>;

// Both produce:
// {
//   name: string;
//   age: number;
//   role: "admin" | "user";
//   address: { city: string; country: string };
//   tags: { tag: string }[];
// }
```

## Choosing a DSL

FormSpec offers two ways to define forms:

### Chain DSL (Recommended)

The builder-based Chain DSL is the primary approach:

```typescript
import { formspec, field, group, buildFormSchemas } from "formspec";

const form = formspec(
  field.text("name", { label: "Full Name" }),
  field.enum("country", ["us", "ca"], { label: "Country" }),
);

// Works at build-time
const { jsonSchema, uiSchema } = buildFormSchemas(form);

// Also works at runtime - no codegen needed
```

**Use the Chain DSL when:**
- You're working with dynamically fetched schema data (the only option for this)
- You want JSON Schema or UI Schema at runtime without a codegen step
- You want type information available without extra build steps

### Decorator DSL

The class-based Decorator DSL uses TypeScript decorators:

```typescript
import { Label, Min, EnumOptions } from "@formspec/decorators";

class InvoiceForm {
  @Label("Customer Name")
  name!: string;

  @Label("Amount")
  @Min(0)
  amount!: number;

  @Label("Status")
  @EnumOptions([
    { id: "draft", label: "Draft" },
    { id: "paid", label: "Paid" },
  ])
  status!: "draft" | "paid";
}
```

**Use the Decorator DSL when:**
- You prefer class-based domain models
- Your types are known at build-time (not dynamically fetched)
- You only need schemas at build-time (no codegen), or you're willing to run `formspec codegen` for runtime access

See [@formspec/decorators](./packages/decorators/README.md) for usage details.

### Comparison

| Aspect | Chain DSL | Decorator DSL |
|--------|-----------|---------------|
| Runtime schemas | Works directly | Requires `formspec codegen` |
| Build-time schemas | Works directly | Works directly |
| Dynamic data | Native support | N/A |
| Type source | Builder methods | TypeScript types |

## JSON Schema Extensions

FormSpec adds custom extensions to JSON Schema for dynamic fields. These use the `x-formspec-` prefix following JSON Schema extension conventions.

### `x-formspec-source`

Added to dynamic enum fields. Indicates the data source key for fetching options at runtime.

```json
{
  "type": "string",
  "x-formspec-source": "fetch_countries"
}
```

### `x-formspec-params`

Added to dynamic enum fields with dependencies. Lists field names whose values are needed to fetch options.

```json
{
  "type": "string",
  "x-formspec-source": "fetch_cities",
  "x-formspec-params": ["country", "state"]
}
```

## Package Structure

FormSpec is organized as a monorepo with the following packages:

| Package | Description |
|---------|-------------|
| `formspec` | Main package with all re-exports (recommended) |
| `@formspec/core` | Core type definitions |
| `@formspec/dsl` | DSL functions (`field`, `group`, `when`, `formspec`) |
| `@formspec/build` | Schema generators |
| `@formspec/runtime` | Resolver helpers |

For most use cases, just import from `formspec`:

```typescript
import { formspec, field, group, when, is, buildFormSchemas, defineResolvers } from "formspec";
```

## API Reference

### DSL Functions

- `formspec(...elements)` - Create a form specification
- `field.text(name, config?)` - Text input field
- `field.number(name, config?)` - Number input field
- `field.boolean(name, config?)` - Boolean checkbox field
- `field.enum(name, options, config?)` - Static enum field
- `field.dynamicEnum(name, source, config?)` - Dynamic enum field (source is the resolver identifier)
- `field.array(name, ...items)` - Array field
- `field.arrayWithConfig(name, config, ...items)` - Array field with constraints
- `field.object(name, ...properties)` - Object field
- `field.objectWithConfig(name, config, ...properties)` - Object field with config
- `group(label, ...elements)` - Visual grouping
- `is(fieldName, value)` - Create an equality predicate
- `when(predicate, ...elements)` - Conditional visibility based on predicate

### Build Functions

- `buildFormSchemas(form)` - Generate both JSON Schema and UI Schema
- `generateJsonSchema(form)` - Generate only JSON Schema
- `generateUiSchema(form)` - Generate only UI Schema
- `writeSchemas(form, options)` - Build and write schemas to disk

### Runtime Functions

- `defineResolvers(form, resolvers)` - Define resolvers for dynamic fields

### Validation Functions

- `formspecWithValidation(options, ...elements)` - Create form with validation
- `validateForm(elements)` - Validate form elements and return issues

```typescript
import { formspecWithValidation, validateForm } from "formspec";

// Validate during creation (logs to console)
const form = formspecWithValidation(
  { validate: true, name: "MyForm" },
  field.text("name"),
  when(is("status", "draft"), field.text("notes")), // Error: "status" doesn't exist
);

// Or validate separately
const result = validateForm(form.elements);
if (!result.valid) {
  console.log(result.issues); // Array of { severity, message, path }
}
```

### Type Utilities

- `InferSchema<Elements>` - Infer schema type from form elements
- `InferFormSchema<Form>` - Infer schema type from FormSpec
- `InferFieldValue<Field>` - Infer value type from a single field

## Build Integration

FormSpec can generate JSON Schema and UI Schema artifacts as part of your build process.

### Using writeSchemas()

The simplest approach is using the `writeSchemas()` helper:

```typescript
// scripts/generate-schemas.ts
import { formspec, field, group, writeSchemas } from "formspec";

const ProductForm = formspec(
  group("Product",
    field.text("name", { required: true }),
    field.enum("status", ["draft", "active", "archived"]),
    field.number("price", { min: 0 }),
  ),
);

// Write schemas to ./generated/product-schema.json and ./generated/product-uischema.json
writeSchemas(ProductForm, {
  outDir: "./generated",
  name: "product",
});
```

### Adding to package.json

Add a script to generate schemas during build:

```json
{
  "scripts": {
    "generate:schemas": "npx tsx scripts/generate-schemas.ts",
    "build": "npm run generate:schemas && your-build-command"
  }
}
```

### Multiple Forms

For multiple forms, create a generation script:

```typescript
// scripts/generate-schemas.ts
import { writeSchemas } from "formspec";
import { ProductForm } from "../src/forms/product.js";
import { CustomerForm } from "../src/forms/customer.js";
import { OrderForm } from "../src/forms/order.js";

const forms = [
  { form: ProductForm, name: "product" },
  { form: CustomerForm, name: "customer" },
  { form: OrderForm, name: "order" },
];

for (const { form, name } of forms) {
  const { jsonSchemaPath, uiSchemaPath } = writeSchemas(form, {
    outDir: "./generated",
    name,
  });
  console.log(`Generated: ${jsonSchemaPath}, ${uiSchemaPath}`);
}
```

### Using the CLI

For quick generation without writing a script, use the CLI:

```bash
# Install @formspec/build (provides the formspec-build command)
npm install -D @formspec/build

# Generate schemas from a file that exports a FormSpec
npx formspec-build src/forms/product.ts -o ./schemas -n product
```

The input file should export the form as default or named `form`:

```typescript
// src/forms/product.ts
import { formspec, field } from "formspec";

export default formspec(
  field.text("name", { required: true }),
  field.enum("status", ["draft", "active"]),
);
```

### Programmatic Control

For more control, use `buildFormSchemas()` directly:

```typescript
import { buildFormSchemas } from "formspec";
import * as fs from "node:fs";

const { jsonSchema, uiSchema } = buildFormSchemas(ProductForm);

// Custom file naming or additional processing
fs.writeFileSync("schemas/product.schema.json", JSON.stringify(jsonSchema, null, 2));
fs.writeFileSync("schemas/product.ui.json", JSON.stringify(uiSchema, null, 2));
```

## License

UNLICENSED
