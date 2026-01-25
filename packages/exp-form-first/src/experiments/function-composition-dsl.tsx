/**
 * FUNCTION COMPOSITION DSL
 *
 * Looks like JSX but uses function calls.
 * Achieves full type inference without duplication.
 *
 * Key insight: We can't infer types from JSX children (they become ReactNode),
 * but function arguments preserve type information through inference.
 */

import type { FC, ReactNode } from "react";

// =============================================================================
// Field Descriptors (the type-preserving building blocks)
// =============================================================================

interface TextFieldDescriptor<N extends string> {
  readonly _kind: "text";
  readonly name: N;
  readonly label?: string;
  readonly placeholder?: string;
  readonly required?: boolean;
}

interface NumberFieldDescriptor<N extends string> {
  readonly _kind: "number";
  readonly name: N;
  readonly label?: string;
  readonly min?: number;
  readonly max?: number;
  readonly required?: boolean;
}

interface CheckboxFieldDescriptor<N extends string> {
  readonly _kind: "checkbox";
  readonly name: N;
  readonly label?: string;
}

interface SelectFieldDescriptor<N extends string, O extends readonly string[]> {
  readonly _kind: "select";
  readonly name: N;
  readonly options: O;
  readonly label?: string;
  readonly required?: boolean;
}

type FieldDescriptor =
  | TextFieldDescriptor<string>
  | NumberFieldDescriptor<string>
  | CheckboxFieldDescriptor<string>
  | SelectFieldDescriptor<string, readonly string[]>;

// =============================================================================
// Field Builders (JSX-like syntax via functions)
// =============================================================================

export function TextField<N extends string>(
  name: N,
  config?: Omit<TextFieldDescriptor<N>, "_kind" | "name">
): TextFieldDescriptor<N> {
  return { _kind: "text", name, ...config };
}

export function NumberField<N extends string>(
  name: N,
  config?: Omit<NumberFieldDescriptor<N>, "_kind" | "name">
): NumberFieldDescriptor<N> {
  return { _kind: "number", name, ...config };
}

export function Checkbox<N extends string>(
  name: N,
  config?: Omit<CheckboxFieldDescriptor<N>, "_kind" | "name">
): CheckboxFieldDescriptor<N> {
  return { _kind: "checkbox", name, ...config };
}

export function SelectField<N extends string, const O extends readonly string[]>(
  name: N,
  options: O,
  config?: Omit<SelectFieldDescriptor<N, O>, "_kind" | "name" | "options">
): SelectFieldDescriptor<N, O> {
  return { _kind: "select", name, options, ...config };
}

// =============================================================================
// Type Inference
// =============================================================================

type InferFieldValue<F> = F extends TextFieldDescriptor<string>
  ? string
  : F extends NumberFieldDescriptor<string>
    ? number
    : F extends CheckboxFieldDescriptor<string>
      ? boolean
      : F extends SelectFieldDescriptor<string, infer O>
        ? O[number]
        : never;

type InferSchema<Fields extends readonly FieldDescriptor[]> = {
  [F in Fields[number] as F extends { name: infer N extends string } ? N : never]: InferFieldValue<F>;
};

// =============================================================================
// Form Builder
// =============================================================================

interface FormProps<Schema> {
  onSubmit?: (values: Schema) => void;
  className?: string;
}

interface FormInstance<Schema, Fields extends readonly FieldDescriptor[]> {
  /** Render the form with all fields auto-generated */
  (props: FormProps<Schema>): ReactNode;

  /** Access to individual field components for custom layout */
  fields: {
    [F in Fields[number] as F extends { name: infer N extends string } ? N : never]: FC<{
      label?: string;
      className?: string;
    }>;
  };

  /** The field descriptors (for introspection) */
  descriptors: Fields;
}

/**
 * Create a form from field descriptors.
 *
 * Usage:
 *   const ContactForm = Form(
 *     TextField("name", { label: "Name" }),
 *     TextField("email", { label: "Email" }),
 *     NumberField("age", { label: "Age", min: 0 }),
 *     SelectField("plan", ["free", "pro", "enterprise"] as const),
 *     Checkbox("subscribe", { label: "Get updates" }),
 *   );
 *
 *   // Auto-layout
 *   <ContactForm onSubmit={(values) => console.log(values.name)} />
 *
 *   // Custom layout
 *   <ContactForm.fields.name />
 *   <ContactForm.fields.email />
 */
export function Form<const Fields extends readonly FieldDescriptor[]>(
  ...fields: Fields
): FormInstance<InferSchema<Fields>, Fields> {
  type Schema = InferSchema<Fields>;

  // Create individual field components
  const fieldComponents = {} as FormInstance<Schema, Fields>["fields"];

  for (const descriptor of fields) {
    const FieldComponent: FC<{ label?: string; className?: string }> = ({
      label,
      className,
    }) => {
      const displayLabel = label ?? descriptor.label ?? descriptor.name;

      switch (descriptor._kind) {
        case "checkbox":
          return (
            <div className={className}>
              <input type="checkbox" id={descriptor.name} name={descriptor.name} />
              <label htmlFor={descriptor.name}>{displayLabel}</label>
            </div>
          );

        case "select":
          return (
            <div className={className}>
              <label htmlFor={descriptor.name}>{displayLabel}</label>
              <select id={descriptor.name} name={descriptor.name}>
                {descriptor.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          );

        case "number":
          return (
            <div className={className}>
              <label htmlFor={descriptor.name}>{displayLabel}</label>
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
            <div className={className}>
              <label htmlFor={descriptor.name}>{displayLabel}</label>
              <input
                type="text"
                id={descriptor.name}
                name={descriptor.name}
                placeholder={(descriptor as TextFieldDescriptor<string>).placeholder}
              />
            </div>
          );
      }
    };

    (fieldComponents as Record<string, FC<{ label?: string; className?: string }>>)[
      descriptor.name
    ] = FieldComponent;
  }

  // Create the form component
  const FormComponent = ({ onSubmit, className }: FormProps<Schema>) => {
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
      <form onSubmit={handleSubmit} className={className}>
        {fields.map((descriptor) => {
          const Field = (fieldComponents as Record<string, FC>)[descriptor.name]!;
          return <Field key={descriptor.name} />;
        })}
        <button type="submit">Submit</button>
      </form>
    );
  };

  // Attach fields and descriptors
  FormComponent.fields = fieldComponents;
  FormComponent.descriptors = fields;

  return FormComponent as FormInstance<InferSchema<Fields>, Fields>;
}

// =============================================================================
// Demo: Complete Working Example
// =============================================================================

// Define the form (looks almost like JSX!)
const ContactForm = Form(
  TextField("name", { label: "Full Name", required: true }),
  TextField("email", { label: "Email Address", placeholder: "you@example.com" }),
  NumberField("age", { label: "Your Age", min: 0, max: 150 }),
  SelectField("plan", ["free", "pro", "enterprise"] as const, { label: "Choose Plan" }),
  Checkbox("subscribe", { label: "Subscribe to newsletter" }),
);

// Usage 1: Auto-layout (renders all fields automatically)
export function ContactAutoLayout() {
  return (
    <ContactForm
      onSubmit={(values) => {
        // values is fully typed!
        console.log(values.name);      // string
        console.log(values.email);     // string
        console.log(values.age);       // number
        console.log(values.plan);      // "free" | "pro" | "enterprise"
        console.log(values.subscribe); // boolean
      }}
    />
  );
}

// Usage 2: Custom layout (arrange fields however you want)
export function ContactCustomLayout() {
  return (
    <form>
      <div className="grid grid-cols-2 gap-4">
        <ContactForm.fields.name />
        <ContactForm.fields.email />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ContactForm.fields.age label="How old are you?" />
        <ContactForm.fields.plan />
      </div>

      <ContactForm.fields.subscribe label="Want occasional updates?" />

      <button type="submit">Send</button>
    </form>
  );
}

// =============================================================================
// Key Insight: Why This Works
// =============================================================================

/*
The function call syntax:
  TextField("name", { label: "Name" })

Preserves the type of "name" as a literal string type, which flows through
to the schema inference. In contrast, JSX:
  <TextField name="name" label="Name" />

Would require complex workarounds because JSX children become ReactNode,
losing all type information.

This approach gives us:
✓ Full type inference (no duplication)
✓ JSX-like readability
✓ Custom layouts with typed field components
✓ Runtime introspection via descriptors
✗ Not actual JSX (can't use JSX features like fragments in definition)

Compare to the alternatives:
- Schema-first (Zod): Types come from schema, but you must map schema → fields
- Pure JSX: Looks great but loses type inference
- This approach: Best of both worlds via function composition
*/
