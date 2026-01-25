# Schema-First vs Form-First: Side-by-Side Comparison

## The Same Form, Two Approaches

### Schema-First (20 lines of user code)

```tsx
import { z } from "zod";
import { createForm } from "@formspec/exp-schema-first";

// 1. Define schema
const Schema = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number().min(0),
  subscribe: z.boolean(),
});

// 2. Get typed components
const { Form, TextField, NumberField, Checkbox, SubmitButton } = createForm(Schema);

// 3. Build UI
export const ContactForm = () => (
  <Form onSubmit={console.log}>
    <TextField path="name" label="Name" />
    <TextField path="email" label="Email" />
    <NumberField path="age" label="Age" />
    <Checkbox path="subscribe" label="Subscribe" />
    <SubmitButton />
  </Form>
);
```

### Form-First (15 lines of user code)

```tsx
import { defineForm, text, number, checkbox, AutoForm } from "@formspec/exp-form-first";

// 1. Define fields (schema inferred!)
const form = defineForm({
  name: text({ label: "Name" }),
  email: text({ label: "Email" }),
  age: number({ label: "Age", min: 0 }),
  subscribe: checkbox({ label: "Subscribe" }),
});

// 2. Render (auto or custom)
export const ContactForm = () => <AutoForm definition={form} onSubmit={console.log} />;
```

---

## Key Differences

| Aspect | Schema-First | Form-First |
|--------|-------------|------------|
| **Lines of code** | ~20 | ~15 |
| **Source of truth** | Zod schema | Field definitions |
| **Type inference** | From Zod → Components | From Fields → Schema |
| **Validation rules** | In schema (`.min()`, `.email()`) | In field config (`min: 0`) |
| **JSX required?** | Yes, manual layout | Optional (AutoForm available) |
| **Select options** | Need `as const` | Automatic literal inference |
| **Sharing schema** | Easy (export schema) | Harder (schema is derived) |

---

## User Experience Analysis

### Schema-First Wins When:
- You have an existing Zod schema to reuse
- Schema is shared across multiple forms
- Complex validation rules (Zod refinements, transforms)
- API-driven data model

### Form-First Wins When:
- Building forms from scratch
- UI layout is the primary concern
- Want minimal boilerplate
- Prefer auto-generated forms

---

## Boilerplate Hidden From Users

### Schema-First Internal Complexity
```
_internal/
├── path-types.ts      # PathsOf, TypeAtPath, PathsToType (40 lines)
└── components.tsx     # createForm, component types (120 lines)
```

### Form-First Internal Complexity
```
_internal/
├── field-builders.ts  # InferFieldValue, InferFormValues (120 lines)
└── components.tsx     # defineForm, AutoForm, renderers (180 lines)
```

---

## Type Safety Comparison

Both approaches provide:
- ✅ Path validation (invalid paths are compile errors)
- ✅ Type-appropriate components (can't use TextField for numbers)
- ✅ Autocomplete in IDE for valid paths
- ✅ Type-safe onSubmit handler

Schema-First extras:
- ✅ Full Zod validation at runtime
- ✅ Complex refinements and transforms

Form-First extras:
- ✅ Constraints colocated with UI (`min`, `max` on field)
- ✅ Zero-config validation from field definitions

---

## Verdict

**For the formspec DSL, Schema-First is recommended** because:

1. Extension configs are API-driven (schema comes from spec)
2. Same schema validates API requests AND drives UI
3. Complex validation rules are common in config
4. Zod is already a dependency for runtime validation

Form-First is better for:
- Internal tools where UI drives the model
- Prototyping forms quickly
- Cases where schema reuse isn't needed
