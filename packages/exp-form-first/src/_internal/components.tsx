/**
 * Internal component implementations for form-first
 */

import type { FC, ReactNode } from "react";
import type {
  FieldDefs,
  AnyFieldDef,
  TextFieldDef,
  NumberFieldDef,
  SelectFieldDef,
  CheckboxFieldDef,
  GroupFieldDef,
} from "./field-builders.js";
import type { InferFormValues } from "./field-builders.js";
export type { InferFormValues } from "./field-builders.js";
import { fieldsToZodSchema } from "./field-builders.js";

// =============================================================================
// Form Definition
// =============================================================================

export interface FormDefinition<Fields extends FieldDefs> {
  fields: Fields;
  Form: FC<{ onSubmit?: ((values: InferFormValues<Fields>) => void) | undefined; children?: ReactNode }>;
}

/**
 * Define a form by specifying its fields.
 * Schema and types are automatically inferred.
 */
export function defineForm<const Fields extends FieldDefs>(
  fields: Fields
): FormDefinition<Fields> {
  const schema = fieldsToZodSchema(fields);

  const Form: FC<{ onSubmit?: ((values: InferFormValues<Fields>) => void) | undefined; children?: ReactNode }> = ({
    onSubmit,
    children,
  }) => {
    const handleSubmit = (e: { preventDefault: () => void; target: EventTarget | null }) => {
      e.preventDefault();
      const formData = new FormData(e.target as HTMLFormElement);
      const values = Object.fromEntries(formData) as unknown;
      const result = (schema as { safeParse: (v: unknown) => { success: boolean; data: unknown } }).safeParse(values);
      if (result.success && onSubmit) {
        onSubmit(result.data as InferFormValues<Fields>);
      }
    };
    return <form onSubmit={handleSubmit}>{children}</form>;
  };

  return { fields, Form };
}

// =============================================================================
// Auto-generating JSX from field definitions
// =============================================================================

function renderField(name: string, field: AnyFieldDef): ReactNode {
  switch (field._type) {
    case "text":
      return (
        <div key={name}>
          {field.label && <label htmlFor={name}>{field.label}</label>}
          <input
            type="text"
            id={name}
            name={name}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            minLength={field.minLength}
            defaultValue={field.defaultValue}
          />
          {field.description && <small>{field.description}</small>}
        </div>
      );

    case "number":
      return (
        <div key={name}>
          {field.label && <label htmlFor={name}>{field.label}</label>}
          <input
            type="number"
            id={name}
            name={name}
            min={field.min}
            max={field.max}
            step={field.step}
            defaultValue={field.defaultValue}
          />
          {field.description && <small>{field.description}</small>}
        </div>
      );

    case "select":
      return (
        <div key={name}>
          {field.label && <label htmlFor={name}>{field.label}</label>}
          <select id={name} name={name} defaultValue={field.defaultValue}>
            {field.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {field.description && <small>{field.description}</small>}
        </div>
      );

    case "checkbox":
      return (
        <div key={name}>
          <input type="checkbox" id={name} name={name} defaultChecked={field.defaultValue} />
          {field.label && <label htmlFor={name}>{field.label}</label>}
          {field.description && <small>{field.description}</small>}
        </div>
      );

    case "group":
      return (
        <fieldset key={name}>
          {field.label && <legend>{field.label}</legend>}
          {Object.entries(field.fields).map(([childName, childField]) =>
            renderField(`${name}.${childName}`, childField)
          )}
        </fieldset>
      );
  }
}

/**
 * Auto-render a form from field definitions (alternative to manual JSX)
 */
export function AutoForm<Fields extends FieldDefs>({
  definition,
  onSubmit,
}: {
  definition: FormDefinition<Fields>;
  onSubmit?: ((values: InferFormValues<Fields>) => void) | undefined;
}): ReactNode {
  const { fields, Form } = definition;
  return (
    <Form onSubmit={onSubmit}>
      {Object.entries(fields).map(([name, field]) => renderField(name, field))}
      <button type="submit">Submit</button>
    </Form>
  );
}

// =============================================================================
// Individual Field Components (for custom layouts)
// =============================================================================

export const TextField: FC<TextFieldDef & { name: string }> = ({ name, ...field }) => (
  <div>
    {field.label && <label htmlFor={name}>{field.label}</label>}
    <input
      type="text"
      id={name}
      name={name}
      placeholder={field.placeholder}
      maxLength={field.maxLength}
      defaultValue={field.defaultValue}
    />
    {field.description && <small>{field.description}</small>}
  </div>
);

export const NumberField: FC<NumberFieldDef & { name: string }> = ({ name, ...field }) => (
  <div>
    {field.label && <label htmlFor={name}>{field.label}</label>}
    <input
      type="number"
      id={name}
      name={name}
      min={field.min}
      max={field.max}
      step={field.step}
      defaultValue={field.defaultValue}
    />
    {field.description && <small>{field.description}</small>}
  </div>
);

export const SelectField: FC<SelectFieldDef & { name: string }> = ({ name, ...field }) => (
  <div>
    {field.label && <label htmlFor={name}>{field.label}</label>}
    <select id={name} name={name} defaultValue={field.defaultValue}>
      {field.options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    {field.description && <small>{field.description}</small>}
  </div>
);

export const CheckboxField: FC<CheckboxFieldDef & { name: string }> = ({ name, ...field }) => (
  <div>
    <input type="checkbox" id={name} name={name} defaultChecked={field.defaultValue} />
    {field.label && <label htmlFor={name}>{field.label}</label>}
    {field.description && <small>{field.description}</small>}
  </div>
);
