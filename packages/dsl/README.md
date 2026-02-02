# @formspec/dsl

Type-safe form definition using a fluent builder API. This is the recommended approach for defining forms programmatically, especially when you need runtime form construction or dynamic forms.

## Installation

```bash
npm install @formspec/dsl @formspec/build
# Or use the umbrella package:
npm install formspec
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
import { formspec, field, group, when, is, type InferFormSchema } from "@formspec/dsl";
import { buildFormSchemas } from "@formspec/build";

// Define a form with full type safety
const ContactForm = formspec(
  field.text("name", { label: "Name", required: true }),
  field.text("email", { label: "Email", required: true }),
  field.enum("subject", ["general", "support", "sales"] as const, {
    label: "Subject",
    required: true
  }),
  field.text("message", { label: "Message", required: true }),
  field.boolean("subscribe", { label: "Subscribe to newsletter" })
);

// Infer TypeScript types from the form definition
type ContactData = InferFormSchema<typeof ContactForm>;
// Result: { name: string; email: string; subject: "general" | "support" | "sales"; message: string; subscribe: boolean }

// Generate JSON Schema and UI Schema
const { jsonSchema, uiSchema } = buildFormSchemas(ContactForm);
```

## Field Types

### Text Field

```typescript
field.text("fieldName", {
  label: "Display Label",
  description: "Help text",
  required: true,
  minLength: 1,
  maxLength: 100,
  pattern: "^[a-zA-Z]+$"  // Regex pattern
});
```

### Number Field

```typescript
field.number("age", {
  label: "Age",
  required: true,
  min: 0,
  max: 120
});
```

### Boolean Field

```typescript
field.boolean("acceptTerms", {
  label: "I accept the terms and conditions",
  required: true
});
```

### Enum Field (Dropdown/Select)

Use `as const` to preserve literal types for type inference:

```typescript
// Simple string options
field.enum("status", ["draft", "published", "archived"] as const, {
  label: "Status",
  required: true
});

// Options with separate IDs and labels
field.enum("country", [
  { id: "us", label: "United States" },
  { id: "ca", label: "Canada" },
  { id: "uk", label: "United Kingdom" }
] as const, {
  label: "Country"
});
```

**Note:** Use `as const` when passing enum options from a variable. For inline array literals, the `const` type parameter preserves literal types automatically.

### Dynamic Enum Field

For dropdowns populated at runtime from an API:

```typescript
field.dynamicEnum("customerId", "fetch_customers", {
  label: "Customer",
  required: true
});
```

The second argument is a source identifier used with `@formspec/runtime` resolvers.

### Array Field

For repeatable field groups:

```typescript
field.array("lineItems",
  field.text("description", { label: "Description", required: true }),
  field.number("quantity", { label: "Quantity", min: 1 }),
  field.number("price", { label: "Unit Price", min: 0 })
);

// With configuration
field.arrayWithConfig("contacts",
  { label: "Contact List", minItems: 1, maxItems: 5 },
  field.text("name", { label: "Name" }),
  field.text("phone", { label: "Phone" })
);
```

### Object Field

For nested field groups:

```typescript
field.object("address",
  field.text("street", { label: "Street", required: true }),
  field.text("city", { label: "City", required: true }),
  field.text("zipCode", { label: "ZIP Code", required: true })
);
```

## Grouping

Use `group()` to visually organize fields:

```typescript
const UserForm = formspec(
  group("Personal Information",
    field.text("firstName", { label: "First Name", required: true }),
    field.text("lastName", { label: "Last Name", required: true }),
    field.text("email", { label: "Email", required: true })
  ),
  group("Preferences",
    field.enum("theme", ["light", "dark", "system"] as const, { label: "Theme" }),
    field.boolean("notifications", { label: "Enable notifications" })
  )
);
```

## Conditional Fields

Use `when()` and `is()` to show/hide fields based on other field values:

```typescript
const OrderForm = formspec(
  field.enum("shippingMethod", ["standard", "express", "pickup"] as const, {
    label: "Shipping Method",
    required: true
  }),

  // Only show address fields when shipping method is not "pickup"
  when(is("shippingMethod", "standard"),
    field.text("address", { label: "Shipping Address", required: true }),
    field.text("city", { label: "City", required: true })
  ),
  when(is("shippingMethod", "express"),
    field.text("address", { label: "Shipping Address", required: true }),
    field.text("city", { label: "City", required: true }),
    field.text("phone", { label: "Phone for courier", required: true })
  )
);
```

## Type Inference

The library provides powerful type inference utilities:

```typescript
import { type InferFormSchema, type InferFieldValue } from "@formspec/dsl";

const MyForm = formspec(
  field.text("name"),
  field.number("age"),
  field.enum("role", ["admin", "user", "guest"] as const)
);

// Infer the complete form data type
type FormData = InferFormSchema<typeof MyForm>;
// { name: string; age: number; role: "admin" | "user" | "guest" }

// Access form elements at runtime
for (const element of MyForm.elements) {
  if (element._type === "field") {
    console.log(element.name, element._field);
  }
}
```

## Validation

Validate form definitions at runtime:

```typescript
import { formspec, field, validateForm, logValidationIssues } from "@formspec/dsl";

const form = formspec(
  field.text("email"),
  field.text("email")  // Duplicate field name!
);

const result = validateForm(form.elements);
if (!result.valid) {
  logValidationIssues(result, "MyForm");
  // Logs: [MyForm] ERROR at email: Duplicate field name "email"
}

// Or use formspecWithValidation for automatic checking
import { formspecWithValidation } from "@formspec/dsl";

const validatedForm = formspecWithValidation(
  { name: "MyForm", validate: "throw" },
  field.text("email"),
  field.text("email")  // Throws error!
);
```

## Schema Generation

Use `@formspec/build` to generate JSON Schema and UI Schema:

```typescript
import { buildFormSchemas, writeSchemas } from "@formspec/build";

// Get schema objects
const { jsonSchema, uiSchema } = buildFormSchemas(MyForm);

// Or write to files
writeSchemas(MyForm, {
  outDir: "./generated",
  name: "MyForm"
});
// Creates:
//   ./generated/MyForm-schema.json
//   ./generated/MyForm-uischema.json
```

## When to Use This Package

Use `@formspec/dsl` when:

- **Forms are defined programmatically** - Building forms from configuration or code
- **Runtime form construction** - Creating forms dynamically based on user input or API data
- **Full type inference needed** - Deriving TypeScript types from form definitions
- **No build step preferred** - Works directly at runtime without CLI codegen

Consider `@formspec/decorators` when:

- **Class-based forms preferred** - Using TypeScript classes with property decorators
- **Type inference from existing types** - Leveraging existing TypeScript class types
- **Static analysis available** - Using the CLI for build-time schema generation

## API Reference

### Functions

| Function | Description |
|----------|-------------|
| `formspec(...elements)` | Create a form specification |
| `formspecWithValidation(options, ...elements)` | Create a form with validation |
| `group(label, ...elements)` | Create a visual field group |
| `when(predicate, ...elements)` | Create conditional fields |
| `is(fieldName, value)` | Create an equality predicate |
| `validateForm(elements)` | Validate form elements |
| `logValidationIssues(result)` | Log validation issues to console |

### Field Builders

| Builder | Description |
|---------|-------------|
| `field.text(name, config?)` | Text input field |
| `field.number(name, config?)` | Numeric input field |
| `field.boolean(name, config?)` | Checkbox/toggle field |
| `field.enum(name, options, config?)` | Dropdown/select field |
| `field.dynamicEnum(name, source, config?)` | API-populated dropdown |
| `field.dynamicSchema(name, source, config?)` | Dynamic nested schema |
| `field.array(name, ...items)` | Repeatable field array |
| `field.arrayWithConfig(name, config, ...items)` | Array with configuration |
| `field.object(name, ...properties)` | Nested object field |
| `field.objectWithConfig(name, config, ...properties)` | Object with configuration |

### Type Utilities

| Type | Description |
|------|-------------|
| `InferFormSchema<F>` | Infer data type from FormSpec |
| `InferSchema<Elements>` | Infer data type from element array |
| `InferFieldValue<F>` | Infer value type from a single field |
| `ExtractFields<E>` | Extract all fields from an element |

## License

UNLICENSED
