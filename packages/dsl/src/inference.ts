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
        ? O extends readonly EnumOption[]
          ? O[number]["id"]
          : O extends readonly string[]
            ? O[number]
            : never
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
 * Extracts fields that are NOT inside conditionals.
 * These fields are always visible and should be required.
 */
export type ExtractNonConditionalFields<E> = E extends AnyField
  ? E
  : E extends Group<infer Elements>
    ? ExtractNonConditionalFieldsFromArray<Elements>
    : E extends Conditional<string, unknown, infer _Elements>
      ? never // Skip conditionals - their fields are optional
      : never;

/**
 * Extracts non-conditional fields from an array of elements.
 */
export type ExtractNonConditionalFieldsFromArray<Elements> =
  Elements extends readonly [infer First, ...infer Rest]
    ? ExtractNonConditionalFields<First> | ExtractNonConditionalFieldsFromArray<Rest>
    : never;

/**
 * Extracts fields that ARE inside conditionals.
 * These fields may or may not be visible and should be optional.
 */
export type ExtractConditionalFields<E> = E extends AnyField
  ? never // Top-level fields are not conditional
  : E extends Group<infer Elements>
    ? ExtractConditionalFieldsFromArray<Elements> // Recurse into groups
    : E extends Conditional<string, unknown, infer Elements>
      ? ExtractFieldsFromArray<Elements> // All fields inside conditional
      : never;

/**
 * Extracts conditional fields from an array of elements.
 */
export type ExtractConditionalFieldsFromArray<Elements> =
  Elements extends readonly [infer First, ...infer Rest]
    ? ExtractConditionalFields<First> | ExtractConditionalFieldsFromArray<Rest>
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
 * Utility type that flattens intersection types into a single object type.
 *
 * This improves TypeScript's display of inferred types and ensures
 * structural equality checks work correctly with tsd.
 */
type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

/**
 * Infers the complete schema type from a form's elements.
 *
 * This is the main inference type that converts a form structure
 * into its corresponding TypeScript schema type.
 *
 * Non-conditional fields are required, conditional fields are optional.
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
 *
 * // Conditional fields become optional:
 * const formWithConditional = formspec(
 *   field.enum("type", ["a", "b"] as const),
 *   when(is("type", "a"), field.text("aField")),
 * );
 * type ConditionalSchema = InferSchema<typeof formWithConditional.elements>;
 * // { type: "a" | "b"; aField?: string }
 * ```
 */
export type InferSchema<Elements extends readonly FormElement[]> = Prettify<
  BuildSchema<ExtractNonConditionalFieldsFromArray<Elements>> &
    Partial<BuildSchema<ExtractConditionalFieldsFromArray<Elements>>>
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
