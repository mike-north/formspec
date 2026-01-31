/**
 * Type-level utilities for inferring schema types from form elements.
 *
 * These types allow TypeScript to automatically derive the form's schema type
 * from its nested element structure.
 */

import type {
  TextField,
  NumberField,
  BooleanField,
  StaticEnumField,
  EnumOption,
  EnumOptionValue,
  DynamicEnumField,
  DynamicSchemaField,
  ArrayField,
  ObjectField,
  AnyField,
  Group,
  Conditional,
  FormElement,
  FormSpec,
  DataSourceValueType,
} from "@formspec/core";

/**
 * Infers the value type from a single field.
 *
 * - TextField returns string
 * - NumberField returns number
 * - BooleanField returns boolean
 * - StaticEnumField returns union of option literals
 * - DynamicEnumField returns DataSourceValueType (usually string)
 * - DynamicSchemaField returns Record of string to unknown
 * - ArrayField returns array of inferred item schema
 * - ObjectField returns object of inferred property schema
 *
 * @example
 * ```typescript
 * // Simple fields
 * type T1 = InferFieldValue<TextField<"name">>; // string
 * type T2 = InferFieldValue<NumberField<"age">>; // number
 *
 * // Enum fields
 * type T3 = InferFieldValue<StaticEnumField<"status", ["draft", "sent"]>>; // "draft" | "sent"
 *
 * // Nested fields
 * type T4 = InferFieldValue<ArrayField<"items", [TextField<"name">]>>; // { name: string }[]
 * type T5 = InferFieldValue<ObjectField<"address", [TextField<"city">]>>; // { city: string }
 * ```
 */
export type InferFieldValue<F> = F extends TextField<string>
  ? string
  : F extends NumberField<string>
    ? number
    : F extends BooleanField<string>
      ? boolean
      : F extends StaticEnumField<string, infer O extends readonly EnumOptionValue[]>
        ? O[number] extends EnumOption ? O[number]["id"] : O[number]
        : F extends DynamicEnumField<string, infer Source>
          ? DataSourceValueType<Source>
          : F extends DynamicSchemaField<string>
            ? Record<string, unknown>
            : F extends ArrayField<string, infer Items extends readonly FormElement[]>
              ? InferSchema<Items>[]
              : F extends ObjectField<string, infer Properties extends readonly FormElement[]>
                ? InferSchema<Properties>
                : never;

/**
 * Extracts all fields from a single element (recursively).
 *
 * - Field elements return themselves
 * - Groups extract fields from all child elements
 * - Conditionals extract fields from all child elements
 */
export type ExtractFields<E> = E extends AnyField
  ? E
  : E extends Group<infer Elements>
    ? ExtractFieldsFromArray<Elements>
    : E extends Conditional<string, unknown, infer Elements>
      ? ExtractFieldsFromArray<Elements>
      : never;

/**
 * Extracts fields from an array of elements.
 *
 * Recursively processes each element and unions the results.
 */
export type ExtractFieldsFromArray<Elements> = Elements extends readonly [
  infer First,
  ...infer Rest,
]
  ? ExtractFields<First> | ExtractFieldsFromArray<Rest>
  : never;

/**
 * Builds a schema type from extracted fields.
 *
 * Maps field names to their inferred value types.
 */
export type BuildSchema<Fields> = {
  [F in Fields as F extends { name: infer N extends string }
    ? N
    : never]: F extends AnyField ? InferFieldValue<F> : never;
};

/**
 * Infers the complete schema type from a form's elements.
 *
 * This is the main inference type that converts a form structure
 * into its corresponding TypeScript schema type.
 *
 * @example
 * ```typescript
 * const form = formspec(
 *   field.text("name"),
 *   field.number("age"),
 *   field.enum("status", ["active", "inactive"] as const),
 * );
 *
 * type Schema = InferSchema<typeof form.elements>;
 * // { name: string; age: number; status: "active" | "inactive" }
 * ```
 */
export type InferSchema<Elements extends readonly FormElement[]> = BuildSchema<
  ExtractFieldsFromArray<Elements>
>;

/**
 * Infers the schema type from a FormSpec.
 *
 * Convenience type that extracts elements and infers the schema.
 *
 * @example
 * ```typescript
 * const form = formspec(...);
 * type Schema = InferFormSchema<typeof form>;
 * ```
 */
export type InferFormSchema<F extends FormSpec<readonly FormElement[]>> =
  F extends FormSpec<infer Elements> ? InferSchema<Elements> : never;
