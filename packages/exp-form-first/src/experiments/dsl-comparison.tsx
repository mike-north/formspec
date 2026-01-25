/**
 * DSL COMPARISON
 *
 * Side-by-side comparison of all DSL approaches.
 * Each approach defines the same contact form.
 */

import { form, text, num, check, choice } from "../_internal/jsx-form.js";
import { Form, TextField, NumberField, Checkbox, SelectField } from "./function-composition-dsl.js";
import { createForm } from "./builder-pattern-dsl.js";

// =============================================================================
// APPROACH 1: Schema-First (Zod) - Shown as pseudocode
// =============================================================================

/*
// This approach lives in exp-schema-first package

import { z } from "zod";
import { fromSchema } from "../_internal/schema-fields.js";

const Schema = z.object({
  name: z.string().min(1).describe("Full name"),
  email: z.string().email().describe("Email address"),
  age: z.number().min(0).max(150),
  plan: z.enum(["free", "pro", "enterprise"]),
  subscribe: z.boolean(),
});

const ContactForm = fromSchema(Schema);

function SchemaFirstExample() {
  return (
    <ContactForm.Form onSubmit={(values) => console.log(values.name)}>
      <ContactForm.fields.name />
      <ContactForm.fields.email />
      <ContactForm.fields.age />
      <ContactForm.fields.plan />
      <ContactForm.fields.subscribe />
      <button type="submit">Submit</button>
    </ContactForm.Form>
  );
}
*/

// =============================================================================
// APPROACH 2: Form-First with Render Props
// =============================================================================

const ContactForm2 = form({
  name: text({ label: "Full Name" }),
  email: text({ label: "Email", placeholder: "you@example.com" }),
  age: num({ label: "Age", min: 0, max: 150 }),
  plan: choice(["free", "pro", "enterprise"] as const, { label: "Plan" }),
  subscribe: check({ label: "Subscribe" }),
});

export function Approach2_RenderProps() {
  return (
    <ContactForm2 onSubmit={(values) => console.log(values.name)}>
      {(f) => (
        <>
          <f.name />
          <f.email />
          <f.age />
          <f.plan />
          <f.subscribe />
          <button type="submit">Submit</button>
        </>
      )}
    </ContactForm2>
  );
}

// =============================================================================
// APPROACH 3: Function Composition (JSX-like)
// =============================================================================

const ContactForm3 = Form(
  TextField("name", { label: "Full Name" }),
  TextField("email", { label: "Email", placeholder: "you@example.com" }),
  NumberField("age", { label: "Age", min: 0, max: 150 }),
  SelectField("plan", ["free", "pro", "enterprise"] as const, { label: "Plan" }),
  Checkbox("subscribe", { label: "Subscribe" }),
);

export function Approach3_FunctionComposition() {
  // Auto-layout
  return <ContactForm3 onSubmit={(values) => console.log(values.name)} />;
}

export function Approach3_CustomLayout() {
  // Custom layout
  return (
    <form>
      <ContactForm3.fields.name />
      <ContactForm3.fields.email />
      <ContactForm3.fields.age />
      <ContactForm3.fields.plan />
      <ContactForm3.fields.subscribe />
      <button type="submit">Submit</button>
    </form>
  );
}

// =============================================================================
// APPROACH 4: Builder Pattern
// =============================================================================

const ContactForm4 = createForm("Contact")
  .text("name", { label: "Full Name" })
  .text("email", { label: "Email", placeholder: "you@example.com" })
  .number("age", { label: "Age", min: 0, max: 150 })
  .select("plan", ["free", "pro", "enterprise"] as const, { label: "Plan" })
  .checkbox("subscribe", { label: "Subscribe" })
  .build();

export function Approach4_BuilderPattern() {
  // Auto-layout
  return <ContactForm4.AutoForm onSubmit={(values) => console.log(values.name)} />;
}

export function Approach4_CustomLayout() {
  // Custom layout
  return (
    <ContactForm4.Form onSubmit={(values) => console.log(values.name)}>
      <ContactForm4.fields.name />
      <ContactForm4.fields.email />
      <ContactForm4.fields.age />
      <ContactForm4.fields.plan />
      <ContactForm4.fields.subscribe />
      <button type="submit">Submit</button>
    </ContactForm4.Form>
  );
}

// =============================================================================
// COMPARISON TABLE
// =============================================================================

/*
┌─────────────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│ Aspect              │ Schema-First │ Render Props │ Function     │ Builder      │
│                     │ (Zod)        │              │ Composition  │ Pattern      │
├─────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Type Inference      │ ✓ Full       │ ✓ Full       │ ✓ Full       │ ✓ Full       │
├─────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ No Duplication      │ ✓            │ ✓            │ ✓            │ ✓            │
├─────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Definition Syntax   │ z.object({}) │ form({})     │ Form(...)    │ createForm() │
│                     │              │              │              │   .text()    │
├─────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ JSX-like Feel       │ ✗ No         │ ~ Partial    │ ✓ Yes        │ ✗ No         │
├─────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Validation Built-in │ ✓ Yes (Zod)  │ ✗ Separate   │ ✗ Separate   │ ✗ Separate   │
├─────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Custom Layout       │ ✓ Yes        │ ✓ Yes        │ ✓ Yes        │ ✓ Yes        │
├─────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Auto Layout         │ ✗ Manual     │ ✗ Manual     │ ✓ Built-in   │ ✓ Built-in   │
├─────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Field Reuse         │ ✓ Yes        │ ✓ Yes        │ ✓ Yes        │ ✓ Yes        │
├─────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ IDE Support         │ ✓ Excellent  │ ✓ Good       │ ✓ Good       │ ✓ Good       │
├─────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Learning Curve      │ Medium       │ Low          │ Low          │ Low          │
├─────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Verbosity           │ Medium       │ Low          │ Low          │ Medium       │
└─────────────────────┴──────────────┴──────────────┴──────────────┴──────────────┘

RECOMMENDATIONS:

1. If you already use Zod: Schema-First
   - Leverage existing schemas
   - Get validation for free
   - Consistent with data layer

2. If you want minimal boilerplate: Function Composition
   - Closest to "pure JSX" feel
   - Concise definition syntax
   - Good balance of features

3. If you want explicit construction: Builder Pattern
   - Clear phases (define → build → use)
   - Good for complex forms
   - Easy to add conditional fields

4. If you prioritize JSX everywhere: Render Props
   - Actual JSX in usage
   - Familiar React pattern
   - Definition is still an object

THE FUNDAMENTAL TRADEOFF:

Pure JSX:
  <TextField name="name" />
  <NumberField name="age" />

This LOOKS great but TypeScript cannot infer a schema from JSX children
because they all become ReactNode. The name="name" becomes just a string
prop, not a literal type that can accumulate into a schema.

Function calls preserve types:
  TextField("name", {...})
  NumberField("age", {...})

This preserves "name" and "age" as literal string types, enabling
full schema inference without any duplication or explicit type annotations.

The best we can do for "JSX-like" is function composition,
which reads like JSX but uses parentheses instead of angle brackets.
*/
