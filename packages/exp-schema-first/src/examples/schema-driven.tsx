/**
 * SCHEMA-FIRST: Schema-Driven Form
 *
 * The schema directly generates field components.
 * No duplication - schema IS the form definition.
 */

import { z } from "zod";
import { fromSchema } from "../_internal/schema-fields.js";

// ─────────────────────────────────────────────────────────────────────────────
// Define schema (single source of truth)
// ─────────────────────────────────────────────────────────────────────────────

const ContactSchema = z.object({
  name: z.string().min(1).describe("Your full name"),
  email: z.string().email().describe("We'll never share this"),
  age: z.number().min(0).max(120),
  plan: z.enum(["free", "pro", "enterprise"]),
  subscribe: z.boolean(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Schema generates field components
// ─────────────────────────────────────────────────────────────────────────────

const Contact = fromSchema(ContactSchema);

// ─────────────────────────────────────────────────────────────────────────────
// Use in JSX - fields come FROM the schema
// ─────────────────────────────────────────────────────────────────────────────

export function ContactForm() {
  return (
    <Contact.Form onSubmit={(values) => {
      // values is fully typed from the schema!
      console.log(values.name, values.email, values.age);
    }}>
      {/* These components ARE the schema fields */}
      <Contact.fields.name />
      <Contact.fields.email />
      <Contact.fields.age label="Your Age" />
      <Contact.fields.plan />
      <Contact.fields.subscribe label="Get updates?" />

      <button type="submit">Submit</button>
    </Contact.Form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom layout - same fields, different arrangement
// ─────────────────────────────────────────────────────────────────────────────

export function ContactFormGrid() {
  return (
    <Contact.Form onSubmit={console.log}>
      <div className="grid grid-cols-2 gap-4">
        <Contact.fields.name />
        <Contact.fields.email />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Contact.fields.age />
        <Contact.fields.plan />
      </div>

      <Contact.fields.subscribe />

      <button type="submit">Submit</button>
    </Contact.Form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KEY INSIGHT: The connection between schema and form
// ─────────────────────────────────────────────────────────────────────────────

// ContactSchema.shape.name  →  Contact.fields.name
// ContactSchema.shape.email →  Contact.fields.email
// etc.
//
// - Field type (text/number/checkbox/select) comes from Zod type
// - Validation rules come from Zod checks (.min, .max, .email)
// - Description comes from .describe()
// - Label defaults to field name, can be overridden
//
// There's no duplication. The schema IS the form.
