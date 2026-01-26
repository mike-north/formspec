/**
 * SCHEMA-FIRST: Auto-Generated Form
 *
 * What if the schema directly drives the form?
 * The schema IS the form definition.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// OPTION A: Schema auto-generates the entire form
// ─────────────────────────────────────────────────────────────────────────────

const ContactSchema = z.object({
  name: z.string().describe("Your full name"),
  email: z.string().email().describe("We'll never share this"),
  age: z.number().min(0).max(120),
  subscribe: z.boolean(),
});

// The schema IS the form - no duplication
// <SchemaForm schema={ContactSchema} onSubmit={console.log} />

// ─────────────────────────────────────────────────────────────────────────────
// OPTION B: Schema provides field components, you arrange them
// ─────────────────────────────────────────────────────────────────────────────

// Imagine this API:
// const Contact = schemaToFields(ContactSchema);
//
// <Form onSubmit={console.log}>
//   <Contact.name />        {/* Already knows it's TextField, has label from .describe() */}
//   <Contact.email />       {/* Already knows validation rules */}
//   <Contact.age />         {/* Already knows it's NumberField with min/max */}
//   <Contact.subscribe />   {/* Already knows it's Checkbox */}
// </Form>

// ─────────────────────────────────────────────────────────────────────────────
// OPTION C: Render props - schema provides typed fields
// ─────────────────────────────────────────────────────────────────────────────

// <Form schema={ContactSchema} onSubmit={console.log}>
//   {(fields) => (
//     <div className="grid">
//       <fields.name label="Full Name" />
//       <fields.email />
//       <fields.age label="Your Age" />
//       <fields.subscribe label="Get updates?" />
//     </div>
//   )}
// </Form>

export {};
