/**
 * Internal component implementations - users import these but don't see internals
 */

import type { FC, ReactNode } from "react";
import type { z } from "zod";
import type { PathsOf, PathsToType, TypeAtPath } from "./path-types.js";

// =============================================================================
// Form Context Types
// =============================================================================

export interface FormContextValue<Schema> {
  schema: z.ZodType<Schema>;
  values: Partial<Schema>;
  errors: Partial<Record<PathsOf<Schema>, string>>;
  setValue: <P extends PathsOf<Schema>>(path: P, value: TypeAtPath<Schema, P>) => void;
}

// =============================================================================
// Component Props Types
// =============================================================================

export interface FormProps<Schema> {
  schema: z.ZodType<Schema>;
  defaultValues?: Partial<Schema>;
  onSubmit?: (values: Schema) => void | Promise<void>;
  children: ReactNode;
}

export interface TextFieldProps<Schema, Path extends PathsToType<Schema, string>> {
  path: Path;
  label?: string;
  placeholder?: string;
  description?: string;
  maxLength?: number;
}

export interface NumberFieldProps<Schema, Path extends PathsToType<Schema, number>> {
  path: Path;
  label?: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
}

type OptionItem<V extends string> = { readonly value: V; readonly label: string };

export interface SelectFieldProps<Schema, Path extends PathsOf<Schema>> {
  path: Path;
  label?: string;
  description?: string;
  options: TypeAtPath<Schema, Path> extends string
    ? readonly OptionItem<TypeAtPath<Schema, Path>>[]
    : never;
}

export interface CheckboxProps<Schema, Path extends PathsToType<Schema, boolean>> {
  path: Path;
  label?: string;
  description?: string;
}

export interface FieldGroupProps<Schema, Path extends PathsOf<Schema>> {
  path: Path;
  label?: string;
  description?: string;
  children: ReactNode;
}

export interface SubmitButtonProps {
  children?: ReactNode;
  disabled?: boolean;
}

// =============================================================================
// Component Factory - Creates typed components for a schema
// =============================================================================

export interface FormComponents<Schema> {
  Form: FC<Omit<FormProps<Schema>, "schema">>;
  TextField: <Path extends PathsToType<Schema, string>>(
    props: TextFieldProps<Schema, Path>
  ) => ReactNode;
  NumberField: <Path extends PathsToType<Schema, number>>(
    props: NumberFieldProps<Schema, Path>
  ) => ReactNode;
  SelectField: <Path extends PathsOf<Schema>>(
    props: SelectFieldProps<Schema, Path>
  ) => ReactNode;
  Checkbox: <Path extends PathsToType<Schema, boolean>>(
    props: CheckboxProps<Schema, Path>
  ) => ReactNode;
  FieldGroup: <Path extends PathsOf<Schema>>(
    props: FieldGroupProps<Schema, Path>
  ) => ReactNode;
  SubmitButton: FC<SubmitButtonProps>;
}

/**
 * Create typed form components for a Zod schema.
 * This is the only function users need to call to set up their form.
 */
export function createForm<Schema>(schema: z.ZodType<Schema>): FormComponents<Schema> {
  // Implementation would wire up React context, validation, etc.
  // For now, stub implementations that demonstrate the API
  return {
    Form: ({ children }) => <form>{children}</form>,
    TextField: ({ path, label }) => (
      <div>
        <label>{label}</label>
        <input type="text" name={path as string} />
      </div>
    ),
    NumberField: ({ path, label }) => (
      <div>
        <label>{label}</label>
        <input type="number" name={path as string} />
      </div>
    ),
    SelectField: ({ path, label, options }) => (
      <div>
        <label>{label}</label>
        <select name={path as string}>
          {(options as readonly { value: string; label: string }[]).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    ),
    Checkbox: ({ path, label }) => (
      <div>
        <input type="checkbox" name={path as string} />
        <label>{label}</label>
      </div>
    ),
    FieldGroup: ({ label, children }) => (
      <fieldset>
        <legend>{label}</legend>
        {children}
      </fieldset>
    ),
    SubmitButton: ({ children }) => <button type="submit">{children ?? "Submit"}</button>,
  };
}
