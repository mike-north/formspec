/**
 * FORM-FIRST: JSX-Centric Approach
 *
 * Define fields minimally, render as JSX.
 * The render prop gives you typed field components.
 */

import { form, text, num, check, choice } from "../_internal/jsx-form.js";

// ─────────────────────────────────────────────────────────────────────────────
// Define form with minimal field definitions
// ─────────────────────────────────────────────────────────────────────────────

const ContactForm = form({
  name: text({ label: "Full Name" }),
  email: text({ label: "Email", placeholder: "you@example.com" }),
  age: num({ label: "Age", min: 0, max: 120 }),
  plan: choice(["free", "pro", "enterprise"] as const, { label: "Plan" }),
  subscribe: check({ label: "Get updates?" }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Render with JSX - fields come from render prop
// ─────────────────────────────────────────────────────────────────────────────

export function Contact() {
  return (
    <ContactForm onSubmit={(values) => {
      // values is typed: { name: string, email: string, age: number, plan: "free"|"pro"|"enterprise", subscribe: boolean }
      console.log(values.name, values.plan);
    }}>
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
    </ContactForm>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom layout - same fields, arranged with CSS
// ─────────────────────────────────────────────────────────────────────────────

export function ContactGrid() {
  return (
    <ContactForm onSubmit={console.log}>
      {(f) => (
        <>
          <div className="grid grid-cols-2 gap-4">
            <f.name />
            <f.email />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <f.age />
            <f.plan />
          </div>
          <f.subscribe />
          <button type="submit">Submit</button>
        </>
      )}
    </ContactForm>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Override labels at render time
// ─────────────────────────────────────────────────────────────────────────────

export function ContactCustomLabels() {
  return (
    <ContactForm onSubmit={console.log}>
      {(f) => (
        <>
          <f.name label="What should we call you?" />
          <f.email label="Best email to reach you" />
          <f.age label="How old are you?" />
          <f.plan label="Choose your plan" />
          <f.subscribe label="Want occasional updates?" />
          <button type="submit">Submit</button>
        </>
      )}
    </ContactForm>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KEY INSIGHT: Field definition vs Field rendering
// ─────────────────────────────────────────────────────────────────────────────

// The field DEFINITION (text, num, etc.) provides:
//   - Type inference (string, number, etc.)
//   - Default config (label, min/max, etc.)
//
// The field RENDERING (<f.name />) provides:
//   - JSX placement (layout control)
//   - Override props (custom label, className)
//
// You define once, render wherever you want.
