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
import { formspec, field, group, when, buildFormSchemas } from "formspec";
import type { InferFormSchema } from "formspec";

// Define your form
const ContactForm = formspec(
  group("Personal Info",
    field.text("name", { label: "Full Name", required: true }),
    field.text("email", { label: "Email", required: true }),
  ),
  group("Preferences",
    field.enum("contactMethod", ["email", "phone", "mail"] as const, {
      label: "Preferred Contact Method",
    }),
    when("contactMethod", "phone",
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
field.enum("status", ["draft", "published", "archived"] as const, { label: "Status" })
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
  field.enum("paymentMethod", ["card", "bank", "crypto"] as const),

  when("paymentMethod", "card",
    field.text("cardNumber", { label: "Card Number" }),
    field.text("cvv", { label: "CVV" }),
  ),

  when("paymentMethod", "bank",
    field.text("accountNumber", { label: "Account Number" }),
    field.text("routingNumber", { label: "Routing Number" }),
  ),
);
```

Conditionals can be nested for complex logic:

```typescript
when("country", "US",
  field.text("ssn", { label: "SSN" }),
  when("paymentMethod", "bank",
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
  field.enum("role", ["admin", "user"] as const),
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
import { formspec, field, group, when, buildFormSchemas, defineResolvers } from "formspec";
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
- `when(fieldName, value, ...elements)` - Conditional visibility

### Build Functions

- `buildFormSchemas(form)` - Generate both JSON Schema and UI Schema
- `generateJsonSchema(form)` - Generate only JSON Schema
- `generateUiSchema(form)` - Generate only UI Schema

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
  when("status", "draft", field.text("notes")), // Error: "status" doesn't exist
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

## License

UNLICENSED
