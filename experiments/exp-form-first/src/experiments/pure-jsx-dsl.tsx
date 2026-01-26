/**
 * PURE JSX DSL EXPLORATION
 *
 * Goal: Everything lives in JSX. No separate config object.
 * Challenge: How do we get type inference?
 */

import type { ReactNode } from "react";

// =============================================================================
// THE DREAM: What we wish we could write
// =============================================================================

/*
<Form onSubmit={(values) => {
  // Somehow values is typed as { name: string, email: string, age: number }
  console.log(values.name);
}}>
  <TextField name="name" label="Name" required />
  <TextField name="email" label="Email" validation="email" />
  <NumberField name="age" label="Age" min={0} max={120} />
  <SelectField name="plan" options={["free", "pro", "enterprise"]} />
  <Checkbox name="subscribe" label="Get updates" />
  <SubmitButton>Send</SubmitButton>
</Form>
*/

// =============================================================================
// OPTION 1: Explicit schema type (duplication, but works)
// =============================================================================

type Option1Schema = {
  name: string;
  email: string;
  age: number;
  plan: "free" | "pro" | "enterprise";
  subscribe: boolean;
};

declare function Form1<T>(props: {
  onSubmit?: (values: T) => void;
  children: ReactNode;
}): ReactNode;

declare function TextField1<T, K extends keyof T>(props: {
  name: K & string;
  label?: string;
}): ReactNode;

// Usage - requires declaring type AND fields (duplication)
function Option1Demo() {
  return (
    <Form1<Option1Schema> onSubmit={(values) => console.log(values.name)}>
      <TextField1<Option1Schema, "name"> name="name" label="Name" />
      <TextField1<Option1Schema, "email"> name="email" label="Email" />
      {/* Verbose and duplicative */}
    </Form1>
  );
}

// =============================================================================
// OPTION 2: Function composition that LOOKS like JSX
// =============================================================================

// What if we use functions that look like JSX but enable inference?

function TextField2<N extends string>(name: N, config?: { label?: string }) {
  return { _type: "text" as const, name, ...config };
}

function NumberField2<N extends string>(name: N, config?: { label?: string; min?: number; max?: number }) {
  return { _type: "number" as const, name, ...config };
}

function SelectField2<N extends string, O extends readonly string[]>(
  name: N,
  options: O,
  config?: { label?: string }
) {
  return { _type: "select" as const, name, options, ...config };
}

function Checkbox2<N extends string>(name: N, config?: { label?: string }) {
  return { _type: "checkbox" as const, name, ...config };
}

// Infer schema from field tuple
type InferFieldValue<F> = F extends { _type: "text" }
  ? string
  : F extends { _type: "number" }
    ? number
    : F extends { _type: "checkbox" }
      ? boolean
      : F extends { _type: "select"; options: readonly (infer O)[] }
        ? O
        : never;

type InferSchemaFromFields<Fields extends readonly { name: string }[]> = {
  [F in Fields[number] as F["name"]]: InferFieldValue<F>;
};

function Form2<const Fields extends readonly { name: string }[]>(
  ...fields: Fields
) {
  type Schema = InferSchemaFromFields<Fields>;

  return {
    render(props: { onSubmit?: (values: Schema) => void }): ReactNode {
      // Implementation would render the fields
      void props;
      return null;
    },
  };
}

// Usage - looks JSX-ish, types are inferred!
const Option2Form = Form2(
  TextField2("name", { label: "Name" }),
  TextField2("email", { label: "Email" }),
  NumberField2("age", { label: "Age", min: 0, max: 120 }),
  SelectField2("plan", ["free", "pro", "enterprise"] as const, { label: "Plan" }),
  Checkbox2("subscribe", { label: "Get updates" }),
);

function Option2Demo() {
  return Option2Form.render({
    onSubmit: (values) => {
      // values is correctly typed!
      console.log(values.name);    // string
      console.log(values.age);     // number
      console.log(values.plan);    // "free" | "pro" | "enterprise"
      console.log(values.subscribe); // boolean
    },
  });
}

// =============================================================================
// OPTION 3: Tagged template literal (like styled-components)
// =============================================================================

// This is more speculative but could be very clean:
/*
const ContactForm = form`
  name: text "Name"
  email: text "Email" email
  age: number "Age" min=0 max=120
  plan: select "Plan" ["free", "pro", "enterprise"]
  subscribe: checkbox "Get updates"
`;

<ContactForm onSubmit={(values) => console.log(values.name)} />
*/

// =============================================================================
// OPTION 4: Builder pattern with JSX-like chaining
// =============================================================================

class FormBuilder<Schema extends Record<string, unknown> = Record<string, never>> {
  private fields: Array<{ name: string; type: string; config: unknown }> = [];

  text<N extends string>(
    name: N,
    config?: { label?: string }
  ): FormBuilder<Schema & { [K in N]: string }> {
    this.fields.push({ name, type: "text", config });
    return this as FormBuilder<Schema & { [K in N]: string }>;
  }

  number<N extends string>(
    name: N,
    config?: { label?: string; min?: number; max?: number }
  ): FormBuilder<Schema & { [K in N]: number }> {
    this.fields.push({ name, type: "number", config });
    return this as FormBuilder<Schema & { [K in N]: number }>;
  }

  select<N extends string, O extends string>(
    name: N,
    options: readonly O[],
    config?: { label?: string }
  ): FormBuilder<Schema & { [K in N]: O }> {
    this.fields.push({ name, type: "select", config: { ...config, options } });
    return this as FormBuilder<Schema & { [K in N]: O }>;
  }

  checkbox<N extends string>(
    name: N,
    config?: { label?: string }
  ): FormBuilder<Schema & { [K in N]: boolean }> {
    this.fields.push({ name, type: "checkbox", config });
    return this as FormBuilder<Schema & { [K in N]: boolean }>;
  }

  build(): { Form: (props: { onSubmit?: (values: Schema) => void; children?: ReactNode }) => ReactNode } {
    return {
      Form: ({ onSubmit, children }) => {
        void onSubmit;
        return <form>{children}</form>;
      },
    };
  }
}

function createForm() {
  return new FormBuilder();
}

// Usage - fluent API, types accumulate
const Option4Form = createForm()
  .text("name", { label: "Name" })
  .text("email", { label: "Email" })
  .number("age", { label: "Age", min: 0, max: 120 })
  .select("plan", ["free", "pro", "enterprise"] as const, { label: "Plan" })
  .checkbox("subscribe", { label: "Get updates" })
  .build();

function Option4Demo() {
  return (
    <Option4Form.Form onSubmit={(values) => {
      // Fully typed!
      console.log(values.name);      // string
      console.log(values.age);       // number
      console.log(values.plan);      // "free" | "pro" | "enterprise"
      console.log(values.subscribe); // boolean
    }}>
      {/* Could render fields here or auto-render */}
    </Option4Form.Form>
  );
}

// =============================================================================
// OPTION 5: Actual JSX with codegen (requires build step)
// =============================================================================

/*
You write this (pure JSX, no types):

// contact-form.formspec.tsx
<Form name="ContactForm">
  <TextField name="name" label="Name" />
  <TextField name="email" label="Email" validation="email" />
  <NumberField name="age" label="Age" min={0} max={120} />
</Form>

A build tool generates:

// contact-form.generated.ts
export type ContactFormSchema = {
  name: string;
  email: string;
  age: number;
};

export const ContactForm: FC<{ onSubmit: (values: ContactFormSchema) => void }>;

Then you use it:

import { ContactForm } from './contact-form.generated';

<ContactForm onSubmit={(values) => console.log(values.name)} />
*/

// =============================================================================
// Prevent unused variable warnings
// =============================================================================
export { Option1Demo, Option2Demo, Option4Demo };
