/**
 * BUILDER PATTERN DSL
 *
 * Fluent API that accumulates types through method chaining.
 * Each method call adds to the schema type.
 *
 * Key insight: Method chaining returns a new builder with an expanded type,
 * so TypeScript tracks the accumulated schema at each step.
 */

import type { FC, ReactNode } from "react";

// =============================================================================
// Field Descriptor Types
// =============================================================================

interface TextConfig {
  label?: string;
  placeholder?: string;
  required?: boolean;
}

interface NumberConfig {
  label?: string;
  min?: number;
  max?: number;
  required?: boolean;
}

interface CheckboxConfig {
  label?: string;
}

interface SelectConfig {
  label?: string;
  required?: boolean;
}

interface FieldDescriptor {
  name: string;
  type: "text" | "number" | "checkbox" | "select";
  config: TextConfig | NumberConfig | CheckboxConfig | SelectConfig;
  options?: readonly string[];
}

// =============================================================================
// Form Builder (accumulates types via method chaining)
// =============================================================================

class FormBuilder<Schema extends Record<string, unknown> = Record<string, never>> {
  private _fields: FieldDescriptor[] = [];
  private _name: string;

  constructor(name: string) {
    this._name = name;
  }

  /**
   * Add a text field
   */
  text<N extends string>(
    name: N,
    config?: TextConfig
  ): FormBuilder<Schema & { [K in N]: string }> {
    this._fields.push({ name, type: "text", config: config ?? {} });
    return this as unknown as FormBuilder<Schema & { [K in N]: string }>;
  }

  /**
   * Add a number field
   */
  number<N extends string>(
    name: N,
    config?: NumberConfig
  ): FormBuilder<Schema & { [K in N]: number }> {
    this._fields.push({ name, type: "number", config: config ?? {} });
    return this as unknown as FormBuilder<Schema & { [K in N]: number }>;
  }

  /**
   * Add a checkbox field
   */
  checkbox<N extends string>(
    name: N,
    config?: CheckboxConfig
  ): FormBuilder<Schema & { [K in N]: boolean }> {
    this._fields.push({ name, type: "checkbox", config: config ?? {} });
    return this as unknown as FormBuilder<Schema & { [K in N]: boolean }>;
  }

  /**
   * Add a select field with typed options
   */
  select<N extends string, const O extends readonly string[]>(
    name: N,
    options: O,
    config?: SelectConfig
  ): FormBuilder<Schema & { [K in N]: O[number] }> {
    this._fields.push({ name, type: "select", config: config ?? {}, options });
    return this as unknown as FormBuilder<Schema & { [K in N]: O[number] }>;
  }

  /**
   * Build the final form
   */
  build(): BuiltForm<Schema> {
    return new BuiltForm<Schema>(this._name, this._fields);
  }
}

// =============================================================================
// Built Form (the result of the builder)
// =============================================================================

interface FormProps<Schema> {
  onSubmit?: (values: Schema) => void;
  className?: string;
  children?: ReactNode;
}

type FieldComponents<Schema> = {
  [K in keyof Schema]: FC<{ label?: string; className?: string }>;
};

class BuiltForm<Schema extends Record<string, unknown>> {
  public readonly name: string;
  public readonly fields: FieldComponents<Schema>;
  private readonly _descriptors: FieldDescriptor[];

  constructor(name: string, descriptors: FieldDescriptor[]) {
    this.name = name;
    this._descriptors = descriptors;
    this.fields = this._createFieldComponents();
  }

  private _createFieldComponents(): FieldComponents<Schema> {
    const components = {} as FieldComponents<Schema>;

    for (const descriptor of this._descriptors) {
      const FieldComponent: FC<{ label?: string; className?: string }> = ({
        label,
        className,
      }) => {
        const displayLabel =
          label ??
          (descriptor.config as TextConfig).label ??
          descriptor.name.charAt(0).toUpperCase() + descriptor.name.slice(1);

        switch (descriptor.type) {
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
                  {descriptor.options?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            );

          case "number": {
            const numConfig = descriptor.config as NumberConfig;
            return (
              <div className={className}>
                <label htmlFor={descriptor.name}>{displayLabel}</label>
                <input
                  type="number"
                  id={descriptor.name}
                  name={descriptor.name}
                  min={numConfig.min}
                  max={numConfig.max}
                />
              </div>
            );
          }

          default: {
            const textConfig = descriptor.config as TextConfig;
            return (
              <div className={className}>
                <label htmlFor={descriptor.name}>{displayLabel}</label>
                <input
                  type="text"
                  id={descriptor.name}
                  name={descriptor.name}
                  placeholder={textConfig.placeholder}
                />
              </div>
            );
          }
        }
      };

      (components as Record<string, FC<{ label?: string; className?: string }>>)[
        descriptor.name
      ] = FieldComponent;
    }

    return components;
  }

  /**
   * The Form wrapper component
   */
  Form: FC<FormProps<Schema>> = ({ onSubmit, className, children }) => {
    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const values = {} as Record<string, unknown>;

      for (const descriptor of this._descriptors) {
        const raw = formData.get(descriptor.name);
        switch (descriptor.type) {
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
        {children}
      </form>
    );
  };

  /**
   * Auto-render all fields
   */
  AutoForm: FC<FormProps<Schema>> = ({ onSubmit, className }) => {
    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const values = {} as Record<string, unknown>;

      for (const descriptor of this._descriptors) {
        const raw = formData.get(descriptor.name);
        switch (descriptor.type) {
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
        {this._descriptors.map((descriptor) => {
          const Field = (this.fields as Record<string, FC>)[descriptor.name]!;
          return <Field key={descriptor.name} />;
        })}
        <button type="submit">Submit</button>
      </form>
    );
  };
}

// =============================================================================
// Factory Function (entry point)
// =============================================================================

/**
 * Create a new form builder.
 *
 * Usage:
 *   const ContactForm = createForm("Contact")
 *     .text("name", { label: "Full Name" })
 *     .text("email", { label: "Email", placeholder: "you@example.com" })
 *     .number("age", { label: "Age", min: 0, max: 150 })
 *     .select("plan", ["free", "pro", "enterprise"] as const, { label: "Plan" })
 *     .checkbox("subscribe", { label: "Get updates" })
 *     .build();
 */
export function createForm(name: string): FormBuilder {
  return new FormBuilder(name);
}

// =============================================================================
// Demo: Complete Working Example
// =============================================================================

// Define the form with fluent builder syntax
const ContactForm = createForm("Contact")
  .text("name", { label: "Full Name", required: true })
  .text("email", { label: "Email Address", placeholder: "you@example.com" })
  .number("age", { label: "Your Age", min: 0, max: 150 })
  .select("plan", ["free", "pro", "enterprise"] as const, { label: "Choose Plan" })
  .checkbox("subscribe", { label: "Subscribe to newsletter" })
  .build();

// Usage 1: Auto-layout (renders all fields automatically)
export function ContactAutoLayout() {
  return (
    <ContactForm.AutoForm
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

// Usage 2: Custom layout with Form wrapper
export function ContactCustomLayout() {
  return (
    <ContactForm.Form
      onSubmit={(values) => {
        console.log(values.name, values.plan);
      }}
    >
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
    </ContactForm.Form>
  );
}

// Usage 3: Just the fields (bring your own form)
export function ContactFieldsOnly() {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // Handle manually
      }}
    >
      <ContactForm.fields.name />
      <ContactForm.fields.email className="mt-4" />
      <ContactForm.fields.age className="mt-4" />
      <ContactForm.fields.plan className="mt-4" />
      <ContactForm.fields.subscribe className="mt-4" />
      <button type="submit" className="mt-4">
        Submit
      </button>
    </form>
  );
}

// =============================================================================
// Key Insight: Why This Works
// =============================================================================

/*
Each method call returns a FormBuilder with an expanded Schema type:

  createForm("Contact")           // FormBuilder<{}>
    .text("name", {...})          // FormBuilder<{ name: string }>
    .text("email", {...})         // FormBuilder<{ name: string; email: string }>
    .number("age", {...})         // FormBuilder<{ name: string; email: string; age: number }>
    .select("plan", [...])        // FormBuilder<{ ...; plan: "free" | "pro" | "enterprise" }>
    .checkbox("subscribe", {...}) // FormBuilder<{ ...; subscribe: boolean }>
    .build()                      // BuiltForm<{ name: string; email: string; age: number; plan: "free" | "pro" | "enterprise"; subscribe: boolean }>

The type accumulates through the chain, giving us:
✓ Full type inference (no duplication)
✓ Method chaining feels natural
✓ Named builder gives context
✓ Build step makes intent clear
✗ Not JSX syntax
✗ Longer method names than JSX would be

Comparison to function composition approach:
- Builder: More explicit about construction phases
- Function composition: More concise, closer to JSX visually
- Both: Achieve the same type inference goal
*/

export { createForm as form, ContactForm };
