/**
 * Form element type definitions.
 *
 * These types define the structure of form specifications.
 * The structure IS the definition - nesting implies layout and conditional logic.
 */

// =============================================================================
// FIELD TYPES
// =============================================================================

/**
 * A text input field.
 *
 * @typeParam N - The field name (string literal type)
 */
export interface TextField<N extends string> {
  /** Type discriminator for form elements */
  readonly _type: "field";
  /** Field type discriminator - identifies this as a text field */
  readonly _field: "text";
  /** Unique field identifier used as the schema key */
  readonly name: N;
  /** Display label for the field */
  readonly label?: string;
  /** Placeholder text shown when field is empty */
  readonly placeholder?: string;
  /** Whether this field is required for form submission */
  readonly required?: boolean;
}

/**
 * A numeric input field.
 *
 * @typeParam N - The field name (string literal type)
 */
export interface NumberField<N extends string> {
  /** Type discriminator for form elements */
  readonly _type: "field";
  /** Field type discriminator - identifies this as a number field */
  readonly _field: "number";
  /** Unique field identifier used as the schema key */
  readonly name: N;
  /** Display label for the field */
  readonly label?: string;
  /** Minimum allowed value */
  readonly min?: number;
  /** Maximum allowed value */
  readonly max?: number;
  /** Whether this field is required for form submission */
  readonly required?: boolean;
}

/**
 * A boolean checkbox field.
 *
 * @typeParam N - The field name (string literal type)
 */
export interface BooleanField<N extends string> {
  /** Type discriminator for form elements */
  readonly _type: "field";
  /** Field type discriminator - identifies this as a boolean field */
  readonly _field: "boolean";
  /** Unique field identifier used as the schema key */
  readonly name: N;
  /** Display label for the field */
  readonly label?: string;
  /** Whether this field is required for form submission */
  readonly required?: boolean;
}

/**
 * An enum option with a separate ID and display label.
 *
 * Use this when the stored value (id) should differ from the display text (label).
 */
export interface EnumOption {
  readonly id: string;
  readonly label: string;
}

/**
 * Valid enum option types: either plain strings or objects with id/label.
 */
export type EnumOptionValue = string | EnumOption;

/**
 * A field with static enum options (known at compile time).
 *
 * Options can be plain strings or objects with `id` and `label` properties.
 *
 * @typeParam N - The field name (string literal type)
 * @typeParam O - Tuple of option values (strings or EnumOption objects)
 */
export interface StaticEnumField<N extends string, O extends readonly EnumOptionValue[]> {
  /** Type discriminator for form elements */
  readonly _type: "field";
  /** Field type discriminator - identifies this as an enum field */
  readonly _field: "enum";
  /** Unique field identifier used as the schema key */
  readonly name: N;
  /** Array of allowed option values */
  readonly options: O;
  /** Display label for the field */
  readonly label?: string;
  /** Whether this field is required for form submission */
  readonly required?: boolean;
}

/**
 * A field with dynamic enum options (fetched from a data source at runtime).
 *
 * @typeParam N - The field name (string literal type)
 * @typeParam Source - The data source key (from DataSourceRegistry)
 */
export interface DynamicEnumField<N extends string, Source extends string> {
  /** Type discriminator for form elements */
  readonly _type: "field";
  /** Field type discriminator - identifies this as a dynamic enum field */
  readonly _field: "dynamic_enum";
  /** Unique field identifier used as the schema key */
  readonly name: N;
  /** Data source key for fetching options at runtime */
  readonly source: Source;
  /** Display label for the field */
  readonly label?: string;
  /** Whether this field is required for form submission */
  readonly required?: boolean;
  /** Field names whose values are needed to fetch options */
  readonly params?: readonly string[];
}

/**
 * A field that loads its schema dynamically (e.g., from an extension).
 *
 * @typeParam N - The field name (string literal type)
 */
export interface DynamicSchemaField<N extends string> {
  /** Type discriminator for form elements */
  readonly _type: "field";
  /** Field type discriminator - identifies this as a dynamic schema field */
  readonly _field: "dynamic_schema";
  /** Unique field identifier used as the schema key */
  readonly name: N;
  /** Identifier for the schema source */
  readonly schemaSource: string;
  /** Display label for the field */
  readonly label?: string;
  /** Whether this field is required for form submission */
  readonly required?: boolean;
}

/**
 * An array field containing repeating items.
 *
 * Use this for lists of values (e.g., multiple addresses, line items).
 *
 * @typeParam N - The field name (string literal type)
 * @typeParam Items - The form elements that define each array item
 */
export interface ArrayField<N extends string, Items extends readonly FormElement[]> {
  /** Type discriminator for form elements */
  readonly _type: "field";
  /** Field type discriminator - identifies this as an array field */
  readonly _field: "array";
  /** Unique field identifier used as the schema key */
  readonly name: N;
  /** Form elements that define the schema for each array item */
  readonly items: Items;
  /** Display label for the field */
  readonly label?: string;
  /** Whether this field is required for form submission */
  readonly required?: boolean;
  /** Minimum number of items required */
  readonly minItems?: number;
  /** Maximum number of items allowed */
  readonly maxItems?: number;
}

/**
 * An object field containing nested properties.
 *
 * Use this for grouping related fields under a single key in the schema.
 *
 * @typeParam N - The field name (string literal type)
 * @typeParam Properties - The form elements that define the object's properties
 */
export interface ObjectField<N extends string, Properties extends readonly FormElement[]> {
  /** Type discriminator for form elements */
  readonly _type: "field";
  /** Field type discriminator - identifies this as an object field */
  readonly _field: "object";
  /** Unique field identifier used as the schema key */
  readonly name: N;
  /** Form elements that define the properties of this object */
  readonly properties: Properties;
  /** Display label for the field */
  readonly label?: string;
  /** Whether this field is required for form submission */
  readonly required?: boolean;
}

/**
 * Union of all field types.
 */
export type AnyField =
  | TextField<string>
  | NumberField<string>
  | BooleanField<string>
  | StaticEnumField<string, readonly EnumOptionValue[]>
  | DynamicEnumField<string, string>
  | DynamicSchemaField<string>
  | ArrayField<string, readonly FormElement[]>
  | ObjectField<string, readonly FormElement[]>;

// =============================================================================
// STRUCTURE TYPES
// =============================================================================

/**
 * A visual grouping of form elements.
 *
 * Groups provide visual organization and can be rendered as fieldsets or sections.
 *
 * @typeParam Elements - Tuple of contained form elements
 */
export interface Group<Elements extends readonly FormElement[]> {
  /** Type discriminator - identifies this as a group element */
  readonly _type: "group";
  /** Display label for the group */
  readonly label: string;
  /** Form elements contained within this group */
  readonly elements: Elements;
}

/**
 * A conditional wrapper that shows/hides elements based on another field's value.
 *
 * @typeParam FieldName - The field to check
 * @typeParam Value - The value that triggers the condition
 * @typeParam Elements - Tuple of contained form elements
 */
export interface Conditional<
  FieldName extends string,
  Value,
  Elements extends readonly FormElement[],
> {
  /** Type discriminator - identifies this as a conditional element */
  readonly _type: "conditional";
  /** Name of the field whose value determines visibility */
  readonly field: FieldName;
  /** Value that triggers the condition (shows nested elements) */
  readonly value: Value;
  /** Form elements shown when condition is met */
  readonly elements: Elements;
}

/**
 * Union of all form element types (fields and structural elements).
 */
export type FormElement =
  | AnyField
  | Group<readonly FormElement[]>
  | Conditional<string, unknown, readonly FormElement[]>;

// =============================================================================
// FORM SPEC
// =============================================================================

/**
 * A complete form specification.
 *
 * @typeParam Elements - Tuple of top-level form elements
 */
export interface FormSpec<Elements extends readonly FormElement[]> {
  /** Top-level form elements */
  readonly elements: Elements;
}
