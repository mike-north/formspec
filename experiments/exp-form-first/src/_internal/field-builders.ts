/**
 * Internal field builder types and inference - users never see this
 */

import type { z } from "zod";

// =============================================================================
// Field Definition Types
// =============================================================================

export interface TextFieldDef {
  readonly _type: "text";
  readonly label?: string;
  readonly placeholder?: string;
  readonly description?: string;
  readonly maxLength?: number;
  readonly minLength?: number;
  readonly required?: boolean;
  readonly defaultValue?: string;
}

export interface NumberFieldDef {
  readonly _type: "number";
  readonly label?: string;
  readonly description?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly required?: boolean;
  readonly defaultValue?: number;
}

export interface SelectFieldDef<Options extends readonly string[] = readonly string[]> {
  readonly _type: "select";
  readonly label?: string;
  readonly description?: string;
  readonly options: readonly { readonly value: Options[number]; readonly label: string }[];
  readonly required?: boolean;
  readonly defaultValue?: Options[number];
}

export interface CheckboxFieldDef {
  readonly _type: "checkbox";
  readonly label?: string;
  readonly description?: string;
  readonly defaultValue?: boolean;
}

export interface GroupFieldDef<Fields extends FieldDefs = FieldDefs> {
  readonly _type: "group";
  readonly label?: string;
  readonly description?: string;
  readonly fields: Fields;
}

export type AnyFieldDef =
  | TextFieldDef
  | NumberFieldDef
  | SelectFieldDef<readonly string[]>
  | CheckboxFieldDef
  | GroupFieldDef<FieldDefs>;

export type FieldDefs = { readonly [key: string]: AnyFieldDef };

// =============================================================================
// Type Inference from Field Definitions
// =============================================================================

export type InferFieldValue<F extends AnyFieldDef> = F extends TextFieldDef
  ? string
  : F extends NumberFieldDef
    ? number
    : F extends SelectFieldDef<infer Options>
      ? Options[number]
      : F extends CheckboxFieldDef
        ? boolean
        : F extends GroupFieldDef<infer Fields>
          ? { [K in keyof Fields]: InferFieldValue<Fields[K]> }
          : never;

export type InferFormValues<Fields extends FieldDefs> = {
  [K in keyof Fields]: InferFieldValue<Fields[K]>;
};

// =============================================================================
// Field Builder Functions
// =============================================================================

export function text(config?: Omit<TextFieldDef, "_type">): TextFieldDef {
  return { _type: "text", ...config };
}

export function number(config?: Omit<NumberFieldDef, "_type">): NumberFieldDef {
  return { _type: "number", ...config };
}

export function select<const Options extends readonly string[]>(
  options: readonly { readonly value: Options[number]; readonly label: string }[],
  config?: Omit<SelectFieldDef<Options>, "_type" | "options">
): SelectFieldDef<Options> {
  return { _type: "select", options, ...config };
}

export function checkbox(config?: Omit<CheckboxFieldDef, "_type">): CheckboxFieldDef {
  return { _type: "checkbox", ...config };
}

export function group<const Fields extends FieldDefs>(
  fields: Fields,
  config?: Omit<GroupFieldDef<Fields>, "_type" | "fields">
): GroupFieldDef<Fields> {
  return { _type: "group", fields, ...config };
}

// =============================================================================
// Zod Schema Generation (runtime)
// =============================================================================

export function fieldsToZodSchema<Fields extends FieldDefs>(
  fields: Fields
): z.ZodType<InferFormValues<Fields>> {
  // Dynamic import to avoid bundling zod in type-only usage
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { z } = require("zod") as typeof import("zod");

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, field] of Object.entries(fields)) {
    shape[key] = fieldToZod(field, z);
  }

  return z.object(shape) as z.ZodType<InferFormValues<Fields>>;
}

function fieldToZod(field: AnyFieldDef, z: typeof import("zod").z): z.ZodTypeAny {
  switch (field._type) {
    case "text": {
      let schema = z.string();
      if (field.minLength) schema = schema.min(field.minLength);
      if (field.maxLength) schema = schema.max(field.maxLength);
      return field.required ? schema : schema.optional();
    }
    case "number": {
      let schema = z.number();
      if (field.min !== undefined) schema = schema.min(field.min);
      if (field.max !== undefined) schema = schema.max(field.max);
      return field.required ? schema : schema.optional();
    }
    case "select": {
      const values = field.options.map((o) => o.value) as [string, ...string[]];
      return z.enum(values);
    }
    case "checkbox":
      return z.boolean();
    case "group":
      return fieldsToZodSchema(field.fields);
    default:
      return z.unknown();
  }
}
