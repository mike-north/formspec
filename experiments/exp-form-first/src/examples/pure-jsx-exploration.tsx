/**
 * FORM-FIRST: Pure JSX Exploration
 *
 * Goal: The JSX IS the form definition. No separate object.
 * Challenge: TypeScript can't infer types from JSX children.
 */

import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// THE DREAM: What we WISH we could write
// ─────────────────────────────────────────────────────────────────────────────

/*
export function ContactForm() {
  return (
    <Form onSubmit={(values) => {
      // values is inferred as { name: string, email: string, age: number }
      console.log(values.name, values.email, values.age);
    }}>
      <TextField name="name" label="Name" />
      <TextField name="email" label="Email" />
      <NumberField name="age" label="Age" />
      <SubmitButton />
    </Form>
  );
}
*/

// ─────────────────────────────────────────────────────────────────────────────
// PROBLEM: JSX children erase type information
// ─────────────────────────────────────────────────────────────────────────────

// When you write <Form>{children}</Form>, TypeScript sees:
//   children: ReactNode
//
// It doesn't know that children contains TextField with name="email".
// The type information is lost.

// ─────────────────────────────────────────────────────────────────────────────
// OPTION A: Builder that looks like JSX (function composition)
// ─────────────────────────────────────────────────────────────────────────────

// Instead of JSX, use a fluent builder:
//
// const form = Form()
//   .field("name", TextField({ label: "Name" }))
//   .field("email", TextField({ label: "Email" }))
//   .field("age", NumberField({ label: "Age", min: 0 }))
//   .build();
//
// // form.values type is inferred as { name: string, email: string, age: number }
// <form.Component onSubmit={(values) => console.log(values.name)} />

// ─────────────────────────────────────────────────────────────────────────────
// OPTION B: Tagged template literal (like styled-components)
// ─────────────────────────────────────────────────────────────────────────────

// const ContactForm = form`
//   name: TextField { label: "Name" }
//   email: TextField { label: "Email" }
//   age: NumberField { label: "Age", min: 0 }
// `;
//
// <ContactForm onSubmit={(values) => console.log(values.name)} />

// ─────────────────────────────────────────────────────────────────────────────
// OPTION C: Array of tuples (closest to JSX feel)
// ─────────────────────────────────────────────────────────────────────────────

// const ContactForm = createForm([
//   ["name", <TextField label="Name" />],
//   ["email", <TextField label="Email" />],
//   ["age", <NumberField label="Age" min={0} />],
// ] as const);

// ─────────────────────────────────────────────────────────────────────────────
// OPTION D: Generic JSX with explicit type parameter
// ─────────────────────────────────────────────────────────────────────────────

// You write JSX but declare the schema type explicitly:
//
// type ContactSchema = {
//   name: string;
//   email: string;
//   age: number;
// };
//
// <Form<ContactSchema> onSubmit={(values) => console.log(values.name)}>
//   <TextField name="name" label="Name" />  // Error if name not in schema
//   <TextField name="email" label="Email" />
//   <NumberField name="age" label="Age" />
// </Form>
//
// This requires declaring the type, but JSX is the UI definition.

// ─────────────────────────────────────────────────────────────────────────────
// OPTION E: Two-phase (define fields, then render)
// ─────────────────────────────────────────────────────────────────────────────

// const fields = {
//   name: TextField({ label: "Name" }),
//   email: TextField({ label: "Email" }),
//   age: NumberField({ label: "Age", min: 0 }),
// } as const;
//
// // Now render with JSX but schema is inferred from fields
// <Form fields={fields} onSubmit={(values) => console.log(values.name)}>
//   {({ name, email, age }) => (
//     <>
//       {name}
//       {email}
//       {age}
//       <SubmitButton />
//     </>
//   )}
// </Form>

export {};
