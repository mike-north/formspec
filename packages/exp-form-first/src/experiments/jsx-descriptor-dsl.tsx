/**
 * JSX DESCRIPTOR DSL - Exploration
 *
 * Question: Can we use actual JSX syntax for form definition?
 *
 * Answer: NO - TypeScript's JSX system requires components to return ReactNode.
 *
 * This file documents the limitation and shows the closest alternatives.
 */

import type { FC, ReactNode } from "react";

// =============================================================================
// WHY JSX DOESN'T WORK FOR TYPE-INFERRED DEFINITIONS
// =============================================================================

/*
When we write JSX:
  <TextField name="name" label="Full Name" />

TypeScript transforms it to:
  TextField({ name: "name", label: "Full Name" })

But TypeScript's JSX type checking REQUIRES that:
1. The function returns ReactNode (or JSX.Element)
2. The result is typed as JSX.Element, not the actual return type

So even if TextField returned a descriptor object at runtime,
TypeScript would type the result as JSX.Element, losing all type info.

ERROR we get when trying:
  'TextField' cannot be used as a JSX component.
  Its type '(props: ...) => TextDescriptor<N>' is not a valid JSX element type.
  Type 'TextDescriptor<string>' is not assignable to type 'ReactNode'.

This is a FUNDAMENTAL TypeScript limitation, not something we can work around.
*/

// =============================================================================
// WHAT DOES WORK: Function calls with JSX-like naming
// =============================================================================

// Descriptor types
interface TextDescriptor<N extends string> {
  _kind: "text";
  name: N;
  label?: string;
  placeholder?: string;
}

interface NumberDescriptor<N extends string> {
  _kind: "number";
  name: N;
  label?: string;
  min?: number;
  max?: number;
}

interface CheckboxDescriptor<N extends string> {
  _kind: "checkbox";
  name: N;
  label?: string;
}

interface SelectDescriptor<N extends string, O extends readonly string[]> {
  _kind: "select";
  name: N;
  options: O;
  label?: string;
}

type AnyDescriptor =
  | TextDescriptor<string>
  | NumberDescriptor<string>
  | CheckboxDescriptor<string>
  | SelectDescriptor<string, readonly string[]>;

// Field builders - these ARE just functions, called with ()
export function TextField<const N extends string>(props: {
  name: N;
  label?: string;
  placeholder?: string;
}): TextDescriptor<N> {
  return { _kind: "text", ...props };
}

export function NumberField<const N extends string>(props: {
  name: N;
  label?: string;
  min?: number;
  max?: number;
}): NumberDescriptor<N> {
  return { _kind: "number", ...props };
}

export function Checkbox<const N extends string>(props: {
  name: N;
  label?: string;
}): CheckboxDescriptor<N> {
  return { _kind: "checkbox", ...props };
}

export function SelectField<const N extends string, const O extends readonly string[]>(props: {
  name: N;
  options: O;
  label?: string;
}): SelectDescriptor<N, O> {
  return { _kind: "select", ...props };
}

// =============================================================================
// Type inference
// =============================================================================

type InferValue<D> = D extends TextDescriptor<string>
  ? string
  : D extends NumberDescriptor<string>
    ? number
    : D extends CheckboxDescriptor<string>
      ? boolean
      : D extends SelectDescriptor<string, infer O>
        ? O[number]
        : never;

type InferSchema<Descriptors extends readonly AnyDescriptor[]> = {
  [D in Descriptors[number] as D extends { name: infer N extends string } ? N : never]: InferValue<D>;
};

// =============================================================================
// Form builder
// =============================================================================

function renderField(descriptor: AnyDescriptor): ReactNode {
  const label = descriptor.label ?? descriptor.name;

  switch (descriptor._kind) {
    case "checkbox":
      return (
        <div key={descriptor.name}>
          <input type="checkbox" id={descriptor.name} name={descriptor.name} />
          <label htmlFor={descriptor.name}>{label}</label>
        </div>
      );
    case "select":
      return (
        <div key={descriptor.name}>
          <label htmlFor={descriptor.name}>{label}</label>
          <select id={descriptor.name} name={descriptor.name}>
            {descriptor.options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    case "number":
      return (
        <div key={descriptor.name}>
          <label htmlFor={descriptor.name}>{label}</label>
          <input
            type="number"
            id={descriptor.name}
            name={descriptor.name}
            min={descriptor.min}
            max={descriptor.max}
          />
        </div>
      );
    default:
      return (
        <div key={descriptor.name}>
          <label htmlFor={descriptor.name}>{label}</label>
          <input
            type="text"
            id={descriptor.name}
            name={descriptor.name}
            placeholder={descriptor.placeholder}
          />
        </div>
      );
  }
}

export function defineForm<const D extends readonly AnyDescriptor[]>(fields: D) {
  type Schema = InferSchema<D>;

  const Form: FC<{ onSubmit?: (values: Schema) => void }> = ({ onSubmit }) => {
    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const values = {} as Record<string, unknown>;

      for (const descriptor of fields) {
        const raw = formData.get(descriptor.name);
        switch (descriptor._kind) {
          case "checkbox":
            values[descriptor.name] = raw === "on";
            break;
          case "number":
            values[descriptor.name] = raw ? Number(raw) : 0;
            break;
          default:
            values[descriptor.name] = raw ?? "";
        }
      }

      onSubmit?.(values as Schema);
    };

    return (
      <form onSubmit={handleSubmit}>
        {fields.map((d) => renderField(d))}
        <button type="submit">Submit</button>
      </form>
    );
  };

  return { Form, fields };
}

// =============================================================================
// THE CLOSEST WE CAN GET TO JSX
// =============================================================================

// Style 1: Object method syntax (reads somewhat like JSX attributes)
const ContactForm = defineForm([
  TextField({ name: "name", label: "Full Name" }),
  TextField({ name: "email", label: "Email", placeholder: "you@example.com" }),
  NumberField({ name: "age", label: "Age", min: 0, max: 150 }),
  SelectField({ name: "plan", options: ["free", "pro", "enterprise"] as const, label: "Plan" }),
  Checkbox({ name: "subscribe", label: "Subscribe" }),
] as const);

export function ContactFormDemo() {
  return (
    <ContactForm.Form
      onSubmit={(values) => {
        // Fully typed!
        console.log(values.name);      // string ✓
        console.log(values.email);     // string ✓
        console.log(values.age);       // number ✓
        console.log(values.plan);      // "free" | "pro" | "enterprise" ✓
        console.log(values.subscribe); // boolean ✓
      }}
    />
  );
}

// Style 2: Two-argument functions (even more concise)
function text<const N extends string>(name: N, config?: Omit<TextDescriptor<N>, "_kind" | "name">): TextDescriptor<N> {
  return { _kind: "text", name, ...config };
}

function num<const N extends string>(name: N, config?: Omit<NumberDescriptor<N>, "_kind" | "name">): NumberDescriptor<N> {
  return { _kind: "number", name, ...config };
}

function checkbox<const N extends string>(name: N, config?: Omit<CheckboxDescriptor<N>, "_kind" | "name">): CheckboxDescriptor<N> {
  return { _kind: "checkbox", name, ...config };
}

function select<const N extends string, const O extends readonly string[]>(
  name: N,
  options: O,
  config?: Omit<SelectDescriptor<N, O>, "_kind" | "name" | "options">
): SelectDescriptor<N, O> {
  return { _kind: "select", name, options, ...config };
}

// This is the most concise syntax possible with full type inference:
const ContactForm2 = defineForm([
  text("name", { label: "Full Name" }),
  text("email", { label: "Email", placeholder: "you@example.com" }),
  num("age", { label: "Age", min: 0, max: 150 }),
  select("plan", ["free", "pro", "enterprise"] as const, { label: "Plan" }),
  checkbox("subscribe", { label: "Subscribe" }),
] as const);

export function ContactFormDemo2() {
  return (
    <ContactForm2.Form
      onSubmit={(values) => {
        // Still fully typed!
        console.log(values.name);      // string ✓
        console.log(values.email);     // string ✓
        console.log(values.age);       // number ✓
        console.log(values.plan);      // "free" | "pro" | "enterprise" ✓
        console.log(values.subscribe); // boolean ✓
      }}
    />
  );
}

// =============================================================================
// COMPARISON: What we wish we could write vs what we can write
// =============================================================================

/*
WISH (Pure JSX - NOT POSSIBLE with type inference):
─────────────────────────────────────────────────────
const ContactForm = (
  <Form>
    <TextField name="name" label="Full Name" />
    <TextField name="email" label="Email" />
    <NumberField name="age" label="Age" min={0} max={150} />
    <SelectField name="plan" options={["free", "pro"]} label="Plan" />
    <Checkbox name="subscribe" label="Subscribe" />
  </Form>
);


REALITY (Function calls - WORKS with full type inference):
──────────────────────────────────────────────────────────
const ContactForm = defineForm([
  text("name", { label: "Full Name" }),
  text("email", { label: "Email" }),
  num("age", { label: "Age", min: 0, max: 150 }),
  select("plan", ["free", "pro"] as const, { label: "Plan" }),
  checkbox("subscribe", { label: "Subscribe" }),
] as const);


The difference:
- < > becomes ( )
- Attributes become object properties or function arguments
- Need `as const` for literal type preservation

Both are declarative and readable, but the function syntax
is necessary for TypeScript to infer the schema types.
*/

export { ContactForm, ContactForm2, text, num, checkbox, select };
