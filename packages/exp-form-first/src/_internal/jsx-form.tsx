/**
 * Form-First: JSX-Centric Approach
 *
 * Fields are defined as an object, but you render them as JSX.
 * The object definition enables type inference, JSX enables layout.
 */

import type { FC, ReactNode } from "react";

// =============================================================================
// Field Definitions (minimal - just enough for type inference)
// =============================================================================

interface TextDef {
  readonly type: "text";
  readonly label?: string;
  readonly placeholder?: string;
}

interface NumberDef {
  readonly type: "number";
  readonly label?: string;
  readonly min?: number;
  readonly max?: number;
}

interface CheckboxDef {
  readonly type: "checkbox";
  readonly label?: string;
}

interface SelectDef<T extends string> {
  readonly type: "select";
  readonly label?: string;
  readonly options: readonly T[];
}

type AnyFieldDef = TextDef | NumberDef | CheckboxDef | SelectDef<string>;

type FieldDefs = Record<string, AnyFieldDef>;

// =============================================================================
// Type Inference
// =============================================================================

type InferValue<F extends AnyFieldDef> = F extends TextDef
  ? string
  : F extends NumberDef
    ? number
    : F extends CheckboxDef
      ? boolean
      : F extends SelectDef<infer T>
        ? T
        : never;

type InferSchema<Fields extends FieldDefs> = {
  [K in keyof Fields]: InferValue<Fields[K]>;
};

// =============================================================================
// Field Builders (minimal syntax)
// =============================================================================

export const text = (config?: Omit<TextDef, "type">): TextDef => ({
  type: "text",
  ...config,
});

export const num = (config?: Omit<NumberDef, "type">): NumberDef => ({
  type: "number",
  ...config,
});

export const check = (config?: Omit<CheckboxDef, "type">): CheckboxDef => ({
  type: "checkbox",
  ...config,
});

export const choice = <const T extends string>(
  options: readonly T[],
  config?: Omit<SelectDef<T>, "type" | "options">
): SelectDef<T> => ({
  type: "select",
  options,
  ...config,
});

// =============================================================================
// Field Components (renderable)
// =============================================================================

type FieldComponent<F extends AnyFieldDef> = FC<{
  label?: string;
  className?: string;
}> & { _def: F };

type RenderableFields<Fields extends FieldDefs> = {
  [K in keyof Fields]: FieldComponent<Fields[K]>;
};

function createFieldComponent<F extends AnyFieldDef>(
  name: string,
  def: F
): FieldComponent<F> {
  const Component: FC<{ label?: string; className?: string }> = ({
    label,
    className,
  }) => {
    const displayLabel = label ?? def.label ?? name;

    switch (def.type) {
      case "checkbox":
        return (
          <div className={className}>
            <input type="checkbox" id={name} name={name} />
            <label htmlFor={name}>{displayLabel}</label>
          </div>
        );

      case "select":
        return (
          <div className={className}>
            <label htmlFor={name}>{displayLabel}</label>
            <select id={name} name={name}>
              {def.options.map((opt) => (
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
            <label htmlFor={name}>{displayLabel}</label>
            <input
              type="number"
              id={name}
              name={name}
              min={def.min}
              max={def.max}
            />
          </div>
        );

      default:
        return (
          <div className={className}>
            <label htmlFor={name}>{displayLabel}</label>
            <input
              type="text"
              id={name}
              name={name}
              placeholder={(def as TextDef).placeholder}
            />
          </div>
        );
    }
  };

  (Component as FieldComponent<F>)._def = def;
  return Component as FieldComponent<F>;
}

// =============================================================================
// Form Creation
// =============================================================================

interface FormResult<Fields extends FieldDefs> {
  (props: {
    onSubmit?: (values: InferSchema<Fields>) => void;
    children: (fields: RenderableFields<Fields>) => ReactNode;
  }): ReactNode;
}

/**
 * Create a form with type-inferred fields.
 *
 * Usage:
 *   const ContactForm = form({
 *     name: text({ label: "Name" }),
 *     email: text({ label: "Email" }),
 *     age: num({ min: 0 }),
 *   });
 *
 *   <ContactForm onSubmit={console.log}>
 *     {(f) => (
 *       <>
 *         <f.name />
 *         <f.email />
 *         <f.age />
 *         <button>Submit</button>
 *       </>
 *     )}
 *   </ContactForm>
 */
export function form<const Fields extends FieldDefs>(
  fields: Fields
): FormResult<Fields> {
  // Create renderable field components
  const renderableFields = {} as RenderableFields<Fields>;
  for (const [key, def] of Object.entries(fields)) {
    (renderableFields as Record<string, FieldComponent<AnyFieldDef>>)[key] =
      createFieldComponent(key, def);
  }

  // Return the Form component
  return function FormComponent({ onSubmit, children }) {
    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const values = Object.fromEntries(formData) as InferSchema<Fields>;
      onSubmit?.(values);
    };

    return <form onSubmit={handleSubmit}>{children(renderableFields)}</form>;
  };
}
