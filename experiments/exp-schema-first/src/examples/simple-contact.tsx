/**
 * SCHEMA-FIRST: Minimal Example
 *
 * Shows the absolute minimum code to create a type-safe form.
 */

import { z } from "zod";
import { createForm } from "../_internal/components.js";

// Schema
const ContactSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  message: z.string(),
  subscribe: z.boolean(),
});

// Components
const { Form, TextField, Checkbox, SubmitButton } = createForm(ContactSchema);

// UI
export const ContactForm = () => (
  <Form onSubmit={console.log}>
    <TextField path="name" label="Name" />
    <TextField path="email" label="Email" />
    <TextField path="message" label="Message" />
    <Checkbox path="subscribe" label="Subscribe to newsletter" />
    <SubmitButton />
  </Form>
);
