/**
 * FORM-FIRST: Minimal Example
 *
 * Shows the absolute minimum code to create a type-safe form.
 * No schema needed - types inferred from field definitions!
 */

import { defineForm, text, checkbox } from "../index.js";
import { AutoForm } from "../_internal/components.js";

// Define fields = Define schema = Define UI
const contactForm = defineForm({
  name: text({ label: "Name" }),
  email: text({ label: "Email" }),
  message: text({ label: "Message" }),
  subscribe: checkbox({ label: "Subscribe to newsletter" }),
});

// Auto-rendered form (one line!)
export const ContactForm = () => <AutoForm definition={contactForm} onSubmit={console.log} />;
