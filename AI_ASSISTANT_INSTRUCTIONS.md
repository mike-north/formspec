# AI Assistant Instructions for FormSpec

This document provides guidance for AI coding assistants helping users work with the FormSpec library.

## Overview

FormSpec is a TypeScript library for defining type-safe forms that compile to JSON Schema and JSON Forms UI Schema. When helping users with FormSpec, understand these core concepts:

1. **DSL-based definition**: Forms are defined using function calls, not JSON
2. **Type inference**: TypeScript automatically infers schema types from form definitions
3. **Structure IS layout**: The nesting of elements defines both data structure and UI layout
4. **Compile-time safety**: Most errors are caught at compile time through TypeScript

---

## Common User Flows

### Flow 1: Creating a New Form

When a user wants to create a new form, guide them through these steps:

```typescript
import { formspec, field, group, when, is, buildFormSchemas } from "formspec";
import type { InferFormSchema } from "formspec";

// Step 1: Define the form structure
const MyForm = formspec(
  // Add fields here
);

// Step 2: Infer the TypeScript type (optional but recommended)
type MyFormSchema = InferFormSchema<typeof MyForm>;

// Step 3: Generate schemas for rendering
const { jsonSchema, uiSchema } = buildFormSchemas(MyForm);
```

**Key points to communicate:**
- Use `as const` on enum arrays to preserve literal types
- Required fields should have `required: true`
- The inferred type matches what form data will look like at runtime

### Flow 2: Adding Basic Fields

Help users understand the available field types:

```typescript
const form = formspec(
  // Text input - for strings
  field.text("username", {
    label: "Username",
    placeholder: "Enter username",
    required: true,
  }),

  // Number input - for numeric values
  field.number("age", {
    label: "Age",
    min: 0,
    max: 150,
    required: true,
  }),

  // Boolean - for checkboxes
  field.boolean("agreeToTerms", {
    label: "I agree to the terms and conditions",
    required: true,
  }),

  // Enum - for dropdowns/radio buttons with fixed options
  // IMPORTANT: Use "as const" to preserve literal types
  field.enum("role", ["admin", "editor", "viewer"] as const, {
    label: "Role",
    required: true,
  }),
);
```

**Common mistakes to watch for:**
- Forgetting `as const` on enum options (results in `string` instead of union type)
- Not setting `required: true` for mandatory fields

### Flow 3: Organizing with Groups

Groups provide visual organization without changing the schema structure:

```typescript
const form = formspec(
  group("Personal Information",
    field.text("firstName", { label: "First Name" }),
    field.text("lastName", { label: "Last Name" }),
    field.text("email", { label: "Email" }),
  ),

  group("Address",
    field.text("street", { label: "Street Address" }),
    field.text("city", { label: "City" }),
    field.text("state", { label: "State" }),
    field.text("zipCode", { label: "ZIP Code" }),
  ),
);

// Schema type is flat:
// { firstName, lastName, email, street, city, state, zipCode }
```

**Explain to users:**
- Groups are purely for UI organization
- They render as fieldsets or card sections
- They don't create nested objects in the schema

### Flow 4: Creating Nested Data Structures

For actual nested data, use `field.object`:

```typescript
const form = formspec(
  field.text("name", { label: "Customer Name" }),

  // This creates a nested object in the schema
  field.object("billingAddress",
    field.text("street", { label: "Street" }),
    field.text("city", { label: "City" }),
    field.text("zip", { label: "ZIP" }),
  ),

  field.object("shippingAddress",
    field.text("street", { label: "Street" }),
    field.text("city", { label: "City" }),
    field.text("zip", { label: "ZIP" }),
  ),
);

// Schema type:
// {
//   name: string;
//   billingAddress: { street: string; city: string; zip: string };
//   shippingAddress: { street: string; city: string; zip: string };
// }
```

### Flow 5: Adding Repeating Items (Arrays)

For lists of items, use `field.array`:

```typescript
const form = formspec(
  field.text("orderNumber", { label: "Order Number" }),

  // Simple array
  field.array("lineItems",
    field.text("productName", { label: "Product" }),
    field.number("quantity", { label: "Qty", min: 1 }),
    field.number("price", { label: "Price", min: 0 }),
  ),

  // Array with constraints
  field.arrayWithConfig("tags", { label: "Tags", minItems: 1, maxItems: 5 },
    field.text("tag", { label: "Tag" }),
  ),
);

// Schema type:
// {
//   orderNumber: string;
//   lineItems: { productName: string; quantity: number; price: number }[];
//   tags: { tag: string }[];
// }
```

### Flow 6: Conditional Field Visibility

Use `when` with the `is()` predicate to show/hide fields based on another field's value:

```typescript
const form = formspec(
  field.enum("employmentStatus", ["employed", "self-employed", "unemployed", "student"] as const, {
    label: "Employment Status",
  }),

  // Only show when employed
  when(is("employmentStatus", "employed"),
    field.text("employerName", { label: "Employer Name" }),
    field.text("jobTitle", { label: "Job Title" }),
  ),

  // Only show when self-employed
  when(is("employmentStatus", "self-employed"),
    field.text("businessName", { label: "Business Name" }),
    field.text("businessType", { label: "Business Type" }),
  ),
);
```

**Key points:**
- The condition field must be defined before (or at same level as) the `when`
- Conditional fields are still in the schema - they're just hidden in the UI
- The inferred type includes all fields regardless of conditions

#### Nested Conditionals

Conditionals can be nested for complex logic:

```typescript
const form = formspec(
  field.enum("country", ["US", "CA", "GB"] as const),
  field.enum("paymentMethod", ["card", "bank"] as const),

  when(is("country", "US"),
    field.text("ssn", { label: "SSN (last 4 digits)" }),

    // Nested: only show when country=US AND paymentMethod=bank
    when(is("paymentMethod", "bank"),
      field.text("routingNumber", { label: "Routing Number" }),
      field.text("accountNumber", { label: "Account Number" }),
    ),
  ),

  when(is("country", "GB"),
    field.text("sortCode", { label: "Sort Code" }),
  ),
);
```

**Explain:** Nested conditionals combine their rules with AND logic in the generated UI Schema.

### Flow 7: Dynamic Data Sources

For dropdowns where options come from an API or database:

```typescript
// Step 1: Define the form with dynamic enum fields
const form = formspec(
  field.dynamicEnum("country", "countries", {
    label: "Country",
    required: true,
  }),

  // Dependent dropdown - options depend on country selection
  field.dynamicEnum("state", "states", {
    label: "State/Province",
    params: ["country"], // This field's options depend on country
  }),

  field.dynamicEnum("city", "cities", {
    label: "City",
    params: ["country", "state"], // Depends on both country and state
  }),
);

// Step 2: Define resolvers for each data source
import { defineResolvers } from "formspec";

const resolvers = defineResolvers(form, {
  countries: async () => ({
    options: [
      { value: "us", label: "United States" },
      { value: "ca", label: "Canada" },
    ],
    validity: "valid",
  }),

  states: async (params) => {
    // params.country contains the selected country
    const states = await fetchStates(params.country);
    return {
      options: states.map(s => ({ value: s.code, label: s.name })),
      validity: states.length > 0 ? "valid" : "unknown",
    };
  },

  cities: async (params) => {
    const cities = await fetchCities(params.country, params.state);
    return {
      options: cities.map(c => ({ value: c.id, label: c.name })),
      validity: "valid",
    };
  },
});
```

**Key concepts:**
- The `source` parameter is a key that maps to a resolver
- The `params` array lists fields whose values are passed to the resolver
- Resolvers return `{ options, validity, message? }`
- Use the `DataSourceRegistry` interface for type-safe data sources

### Flow 8: Dynamic Schemas (Extensions/Plugins)

For forms that load parts of their schema dynamically:

```typescript
const form = formspec(
  field.enum("extensionType", ["stripe", "paypal", "square"] as const, {
    label: "Payment Provider",
  }),

  // Schema for this field is loaded at runtime based on extensionType
  field.dynamicSchema("extensionConfig", "payment-extension", {
    label: "Provider Configuration",
  }),
);
```

**Explain:** The `schemaSource` parameter identifies where to load the schema from. Your application must implement the schema loading logic.

---

## JSON Schema Extensions

When users ask about the generated JSON Schema, explain these FormSpec-specific extensions:

### `x-formspec-source`
Marks a field as a dynamic enum and specifies the data source:
```json
{
  "type": "string",
  "x-formspec-source": "countries"
}
```

### `x-formspec-params`
Lists dependent fields for cascading dropdowns:
```json
{
  "type": "string",
  "x-formspec-source": "cities",
  "x-formspec-params": ["country", "state"]
}
```

### `x-formspec-schemaSource`
Marks a field as having a dynamically-loaded schema:
```json
{
  "type": "object",
  "x-formspec-schemaSource": "payment-extension"
}
```

---

## Type Inference Guidance

Help users understand type inference:

```typescript
import type { InferSchema, InferFormSchema, InferFieldValue } from "formspec";

// From form elements
type Schema = InferSchema<typeof myForm.elements>;

// From entire FormSpec (convenience)
type Schema = InferFormSchema<typeof myForm>;

// From a single field
type FieldValue = InferFieldValue<typeof someField>;
```

**Type inference rules:**
- `field.text` → `string`
- `field.number` → `number`
- `field.boolean` → `boolean`
- `field.enum(..., ["a", "b"] as const)` → `"a" | "b"`
- `field.dynamicEnum` → `string` (or custom via DataSourceRegistry)
- `field.object(...)` → `{ nested: object }`
- `field.array(...)` → `{ item: schema }[]`

---

## Common Patterns

### Pattern: Form with Required and Optional Sections

```typescript
const form = formspec(
  // Required section
  group("Required Information",
    field.text("email", { label: "Email", required: true }),
    field.text("password", { label: "Password", required: true }),
  ),

  // Optional section with toggle
  field.boolean("hasProfile", { label: "Add profile information?" }),

  when(is("hasProfile", true),
    group("Profile (Optional)",
      field.text("displayName", { label: "Display Name" }),
      field.text("bio", { label: "Bio" }),
    ),
  ),
);
```

### Pattern: Multi-Step Form

```typescript
// Define each step as a separate form, then combine or use separately
const Step1 = formspec(
  field.text("email", { required: true }),
  field.text("password", { required: true }),
);

const Step2 = formspec(
  field.text("firstName", { required: true }),
  field.text("lastName", { required: true }),
);

const Step3 = formspec(
  field.object("address",
    field.text("street"),
    field.text("city"),
  ),
);

// Generate schemas for each step
const step1Schemas = buildFormSchemas(Step1);
const step2Schemas = buildFormSchemas(Step2);
const step3Schemas = buildFormSchemas(Step3);
```

### Pattern: Dynamic Form Based on User Type

```typescript
const form = formspec(
  field.enum("userType", ["individual", "business"] as const, {
    label: "Account Type",
    required: true,
  }),

  // Common fields
  field.text("email", { label: "Email", required: true }),

  // Individual-specific
  when(is("userType", "individual"),
    field.text("firstName", { label: "First Name", required: true }),
    field.text("lastName", { label: "Last Name", required: true }),
    field.text("ssn", { label: "SSN (last 4)" }),
  ),

  // Business-specific
  when(is("userType", "business"),
    field.text("companyName", { label: "Company Name", required: true }),
    field.text("taxId", { label: "Tax ID", required: true }),
    field.text("duns", { label: "DUNS Number" }),
  ),
);
```

---

## Validation

FormSpec provides runtime validation to catch common mistakes. Use `formspecWithValidation` or `validateForm` to detect:

1. **Duplicate field names** (warning) - Same field name used multiple times
2. **Missing field references** (error) - Conditionals that reference non-existent fields

### Using Validation

```typescript
import { formspecWithValidation, validateForm } from "formspec";

// Option 1: Validate during form creation
const form = formspecWithValidation(
  { validate: true, name: "MyForm" },
  field.text("name"),
  field.enum("status", ["draft", "sent"] as const),
  when(is("status", "draft"),
    field.text("notes"),
  ),
);

// Option 2: Validate separately
const form = formspec(
  field.text("name"),
  when(is("nonExistent", "value"), field.text("extra")), // Error!
);
const result = validateForm(form.elements);
// result.valid === false
// result.issues[0].message contains "non-existent field"
```

### Validation Options

```typescript
formspecWithValidation(
  {
    // Log warnings/errors to console
    validate: true,        // or "warn"

    // Throw on validation errors
    validate: "throw",

    // Skip validation
    validate: false,

    // Form name for better error messages
    name: "InvoiceForm",
  },
  ...elements
);
```

### Validation Result

```typescript
interface ValidationResult {
  valid: boolean;  // false if any errors (warnings don't affect this)
  issues: ValidationIssue[];
}

interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
  path: string;  // e.g., "when(status).fieldName"
}
```

**When to use validation:**
- During development to catch mistakes early
- In CI/CD to prevent invalid forms from being deployed
- Use `validate: "throw"` in tests to ensure forms are valid

---

## Troubleshooting Guide

### Issue: Enum type is `string` instead of union

**Problem:**
```typescript
field.enum("status", ["draft", "published"]) // Type: string
```

**Solution:**
```typescript
field.enum("status", ["draft", "published"] as const) // Type: "draft" | "published"
```

### Issue: Type inference not working

**Check:**
1. Is the form defined with `const`?
2. Are enum options using `as const`?
3. Is the form variable typed explicitly? (Remove explicit type annotation)

```typescript
// Bad - explicit type prevents inference
const form: FormSpec<...> = formspec(...);

// Good - let TypeScript infer
const form = formspec(...);
```

### Issue: Conditional field references unknown field

**Problem:**
```typescript
when("nonExistent", "value", ...) // Runtime: field doesn't exist
```

**Solution:**
Ensure the condition field is defined before or at the same level as the `when`:
```typescript
field.enum("myField", ["a", "b"] as const),
when(is("myField", "a"), ...),
```

### Issue: Nested object vs Group confusion

**Explain the difference:**
- `group("Label", ...)` - UI organization only, flat schema
- `field.object("key", ...)` - Creates nested object in schema

```typescript
// Group: schema is { name, email }
group("Contact",
  field.text("name"),
  field.text("email"),
)

// Object: schema is { contact: { name, email } }
field.object("contact",
  field.text("name"),
  field.text("email"),
)
```

---

## Package Imports

For most users, recommend the main package:

```typescript
import { formspec, field, group, when, is, buildFormSchemas, defineResolvers } from "formspec";
import type { InferFormSchema, JSONSchema7, UISchema } from "formspec";
```

For advanced users needing specific packages:

```typescript
// Core types only
import type { FormElement, AnyField, Group, Conditional } from "@formspec/core";

// DSL only
import { field, group, when, is, formspec } from "@formspec/dsl";
import type { InferSchema } from "@formspec/dsl";

// Build only
import { generateJsonSchema, generateUiSchema } from "@formspec/build";

// Runtime only
import { defineResolvers } from "@formspec/runtime";
```

---

## Summary Checklist for AI Assistants

When helping a user with FormSpec:

1. **Understand their goal**: New form? Adding fields? Conditional logic? Dynamic data?
2. **Start simple**: Begin with basic fields, add complexity as needed
3. **Use `as const`**: Always remind about `as const` for enum options
4. **Explain type inference**: Show how types flow from definition to schema
5. **Differentiate group vs object**: Common confusion point
6. **Test incrementally**: Suggest building schemas after each change to verify
7. **Check imports**: Ensure they're importing from `formspec` (main package)
