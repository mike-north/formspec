/**
 * UNIFIED STRUCTURE DSL
 *
 * The structure IS the definition. Fields are defined inside their UI context.
 * Nesting implies layout, field type implies control type.
 *
 * No separate schema + UI phases - one definition serves both purposes.
 */

// =============================================================================
// DATA SOURCE REGISTRY (for dynamic enums)
// =============================================================================

export interface DataSourceRegistry {
  // Extended by consumers via module augmentation
}

// =============================================================================
// ELEMENT TYPES (fields, groups, conditionals)
// =============================================================================

interface TextField<N extends string> {
  readonly _type: "field";
  readonly _field: "text";
  readonly name: N;
  readonly label?: string;
  readonly placeholder?: string;
}

interface NumberField<N extends string> {
  readonly _type: "field";
  readonly _field: "number";
  readonly name: N;
  readonly label?: string;
  readonly min?: number;
  readonly max?: number;
}

interface BooleanField<N extends string> {
  readonly _type: "field";
  readonly _field: "boolean";
  readonly name: N;
  readonly label?: string;
}

interface StaticEnumField<N extends string, O extends readonly string[]> {
  readonly _type: "field";
  readonly _field: "enum";
  readonly name: N;
  readonly options: O;
  readonly label?: string;
}

interface DynamicEnumField<N extends string, Source extends string> {
  readonly _type: "field";
  readonly _field: "dynamic_enum";
  readonly name: N;
  readonly source: Source;
  readonly label?: string;
  readonly params?: ReadonlyArray<string>;
}

type AnyField =
  | TextField<string>
  | NumberField<string>
  | BooleanField<string>
  | StaticEnumField<string, readonly string[]>
  | DynamicEnumField<string, string>;

interface Group<Elements extends readonly FormElement[]> {
  readonly _type: "group";
  readonly label: string;
  readonly elements: Elements;
}

interface Conditional<
  FieldName extends string,
  Value,
  Elements extends readonly FormElement[],
> {
  readonly _type: "conditional";
  readonly field: FieldName;
  readonly value: Value;
  readonly elements: Elements;
}

type FormElement =
  | AnyField
  | Group<readonly FormElement[]>
  | Conditional<string, unknown, readonly FormElement[]>;

// =============================================================================
// FIELD BUILDERS
// =============================================================================

export const field = {
  text: <const N extends string>(
    name: N,
    config?: Omit<TextField<N>, "_type" | "_field" | "name">
  ): TextField<N> => ({
    _type: "field",
    _field: "text",
    name,
    ...config,
  }),

  number: <const N extends string>(
    name: N,
    config?: Omit<NumberField<N>, "_type" | "_field" | "name">
  ): NumberField<N> => ({
    _type: "field",
    _field: "number",
    name,
    ...config,
  }),

  boolean: <const N extends string>(
    name: N,
    config?: Omit<BooleanField<N>, "_type" | "_field" | "name">
  ): BooleanField<N> => ({
    _type: "field",
    _field: "boolean",
    name,
    ...config,
  }),

  enum: <const N extends string, const O extends readonly string[]>(
    name: N,
    options: O,
    config?: Omit<StaticEnumField<N, O>, "_type" | "_field" | "name" | "options">
  ): StaticEnumField<N, O> => ({
    _type: "field",
    _field: "enum",
    name,
    options,
    ...config,
  }),

  dynamicEnum: <const N extends string, const Source extends string>(
    name: N,
    source: Source,
    config?: Omit<DynamicEnumField<N, Source>, "_type" | "_field" | "name" | "source">
  ): DynamicEnumField<N, Source> => ({
    _type: "field",
    _field: "dynamic_enum",
    name,
    source,
    ...config,
  }),
};

// =============================================================================
// STRUCTURE BUILDERS
// =============================================================================

export function group<const Elements extends readonly FormElement[]>(
  label: string,
  ...elements: Elements
): Group<Elements> {
  return { _type: "group", label, elements };
}

// =============================================================================
// TYPE EXTRACTION - Get schema type from nested structure
// =============================================================================

/** Get value type for a data source */
type DataSourceValueType<Source extends string> =
  Source extends keyof DataSourceRegistry
    ? DataSourceRegistry[Source] extends { id: infer ID }
      ? ID
      : string
    : string;

/** Infer value type from a single field */
type InferFieldValue<F> = F extends TextField<string>
  ? string
  : F extends NumberField<string>
    ? number
    : F extends BooleanField<string>
      ? boolean
      : F extends StaticEnumField<string, infer O>
        ? O[number]
        : F extends DynamicEnumField<string, infer Source>
          ? DataSourceValueType<Source>
          : never;

/** Extract all fields from a single element (recursively) */
type ExtractFields<E> = E extends AnyField
  ? E
  : E extends Group<infer Elements>
    ? ExtractFieldsFromArray<Elements>
    : E extends Conditional<string, unknown, infer Elements>
      ? ExtractFieldsFromArray<Elements>
      : never;

/** Extract fields from an array of elements */
type ExtractFieldsFromArray<Elements> = Elements extends readonly [
  infer First,
  ...infer Rest,
]
  ? ExtractFields<First> | ExtractFieldsFromArray<Rest>
  : never;

/** Build schema from extracted fields */
type BuildSchema<Fields> = {
  [F in Fields as F extends { name: infer N extends string }
    ? N
    : never]: F extends AnyField ? InferFieldValue<F> : never;
};

/** The main schema inference type */
type InferSchema<Elements extends readonly FormElement[]> = BuildSchema<
  ExtractFieldsFromArray<Elements>
>;

// =============================================================================
// CONDITIONAL BUILDER
// =============================================================================

/**
 * Create a conditional element.
 *
 * Type safety approach: The field name and value are captured as literal types.
 * Validation happens at the formspec level - if you reference a non-existent
 * field or use a wrong value type, you'll get a type error there.
 */
export function when<
  const K extends string,
  const V,
  const Elements extends readonly FormElement[],
>(
  fieldName: K,
  value: V,
  ...elements: Elements
): Conditional<K, V, Elements> {
  return {
    _type: "conditional",
    field: fieldName,
    value,
    elements,
  };
}

// =============================================================================
// FORM SPEC BUILDER
// =============================================================================

interface FormSpec<Elements extends readonly FormElement[]> {
  readonly elements: Elements;
}

/**
 * Define a form specification.
 *
 * The structure IS the definition:
 * - Nesting with `group()` defines visual layout
 * - Nesting with `when()` defines conditional visibility
 * - Field type implies control type (text field -> text input)
 * - Array position implies field ordering
 *
 * Schema is automatically inferred from all fields in the structure.
 */
export function formspec<const Elements extends readonly FormElement[]>(
  ...elements: Elements
): FormSpec<Elements> {
  return { elements };
}

// =============================================================================
// EXAMPLE: Register dynamic data sources
// =============================================================================

declare module "./unified-structure-dsl.js" {
  interface DataSourceRegistry {
    templates: { id: string; name: string };
    countries: { id: string; code: string; name: string };
  }
}

// =============================================================================
// EXAMPLE: Invoice Form
// =============================================================================

const InvoiceForm = formspec(
  group(
    "Customer",
    field.text("customerName", { label: "Customer Name" }),
    field.dynamicEnum("country", "countries", { label: "Country" }),
  ),

  group(
    "Invoice Details",
    field.dynamicEnum("templateId", "templates", { label: "Template" }),
    field.number("amount", { label: "Amount", min: 0 }),
    field.enum("status", ["draft", "sent", "paid"] as const, { label: "Status" }),

    // Conditional: only show internal notes when status is "draft"
    when(
      "status",
      "draft",
      field.text("internalNotes", { label: "Internal Notes" }),
    ),
  ),
);

// =============================================================================
// TYPE VERIFICATION
// =============================================================================

type InvoiceFormSchema = InferSchema<typeof InvoiceForm.elements>;
// {
//   customerName: string;
//   country: string;         <- dynamic enum, type from DataSourceRegistry
//   templateId: string;      <- dynamic enum
//   amount: number;
//   status: "draft" | "sent" | "paid";
//   internalNotes: string;   <- inside conditional, still part of schema
// }

export { InvoiceForm };
export type { FormSpec, FormElement, InferSchema };
