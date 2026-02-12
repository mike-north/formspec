/**
 * Field builder functions for creating form field definitions.
 *
 * Each function creates a field descriptor that captures both schema information
 * (name, type) and UI hints (label, placeholder, etc.).
 */

import type {
  TextField,
  NumberField,
  BooleanField,
  StaticEnumField,
  EnumOptionValue,
  DynamicEnumField,
  DynamicSchemaField,
  ArrayField,
  ObjectField,
  FormElement,
} from "@formspec/core";

/**
 * Field builder namespace containing functions to create each field type.
 *
 * @example
 * ```typescript
 * import { field } from "@formspec/dsl";
 *
 * field.text("name", { label: "Full Name" });
 * field.number("age", { min: 0, max: 150 });
 * field.enum("status", ["draft", "sent", "paid"]);
 * field.dynamicEnum("country", "countries", { label: "Country" });
 * ```
 */
export const field = {
  /**
   * Creates a text input field.
   *
   * @param name - The field name (used as the schema key)
   * @param config - Optional configuration for label, placeholder, etc.
   * @returns A TextField descriptor
   */
  text: <const N extends string>(
    name: N,
    config?: Omit<TextField<N>, "_type" | "_field" | "name">
  ): TextField<N> => ({
    _type: "field",
    _field: "text",
    name,
    ...config,
  }),

  /**
   * Creates a numeric input field.
   *
   * @param name - The field name (used as the schema key)
   * @param config - Optional configuration for label, min, max, etc.
   * @returns A NumberField descriptor
   */
  number: <const N extends string>(
    name: N,
    config?: Omit<NumberField<N>, "_type" | "_field" | "name">
  ): NumberField<N> => ({
    _type: "field",
    _field: "number",
    name,
    ...config,
  }),

  /**
   * Creates a boolean checkbox field.
   *
   * @param name - The field name (used as the schema key)
   * @param config - Optional configuration for label, etc.
   * @returns A BooleanField descriptor
   */
  boolean: <const N extends string>(
    name: N,
    config?: Omit<BooleanField<N>, "_type" | "_field" | "name">
  ): BooleanField<N> => ({
    _type: "field",
    _field: "boolean",
    name,
    ...config,
  }),

  /**
   * Creates a field with static enum options (known at compile time).
   *
   * Literal types are automatically inferred - no `as const` needed:
   * ```typescript
   * field.enum("status", ["draft", "sent", "paid"])
   * // Schema type: "draft" | "sent" | "paid"
   * ```
   *
   * Options can be strings or objects with `id` and `label`:
   * ```typescript
   * field.enum("priority", [
   *   { id: "low", label: "Low Priority" },
   *   { id: "high", label: "High Priority" },
   * ])
   * ```
   *
   * **Note:** All options must be of the same type (all strings OR all objects).
   * Mixing strings and objects will throw a runtime error.
   *
   * @param name - The field name (used as the schema key)
   * @param options - Array of allowed string values or {id, label} objects
   * @param config - Optional configuration for label, etc.
   * @returns A StaticEnumField descriptor
   * @throws Error if options array contains mixed types (strings and objects)
   */
  enum: <const N extends string, const O extends readonly EnumOptionValue[]>(
    name: N,
    options: O,
    config?: Omit<StaticEnumField<N, O>, "_type" | "_field" | "name" | "options">
  ): StaticEnumField<N, O> => {
    // Validate that all options are of the same type (all strings or all objects)
    if (options.length > 0) {
      const first = options[0];
      // Runtime check: TypeScript allows mixed arrays, but we enforce homogeneity
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const firstIsObject = typeof first === "object" && first !== null;

      // Check all items match the type of the first item
      for (const opt of options) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const optIsObject = typeof opt === "object" && opt !== null;
        if (optIsObject !== firstIsObject) {
          throw new Error(
            `field.enum("${name}"): options must be all strings or all objects with {id, label}, not mixed. ` +
            `Received mixed types in options array.`
          );
        }
      }

      // Validate object options have required properties
      if (firstIsObject) {
        for (const opt of options) {
          const obj = opt as { id?: unknown; label?: unknown };
          if (typeof obj.id !== "string" || typeof obj.label !== "string") {
            throw new Error(
              `field.enum("${name}"): object options must have string "id" and "label" properties. ` +
              `Received: ${JSON.stringify(opt)}`
            );
          }
        }
      }
    }

    return {
      _type: "field",
      _field: "enum",
      name,
      options,
      ...config,
    };
  },

  /**
   * Creates a field with dynamic enum options (fetched from a data source at runtime).
   *
   * The data source must be registered in DataSourceRegistry via module augmentation:
   * ```typescript
   * declare module "@formspec/core" {
   *   interface DataSourceRegistry {
   *     countries: { id: string; code: string; name: string };
   *   }
   * }
   *
   * field.dynamicEnum("country", "countries", { label: "Country" })
   * ```
   *
   * @param name - The field name (used as the schema key)
   * @param source - The data source key (must be in DataSourceRegistry)
   * @param config - Optional configuration for label, params, etc.
   * @returns A DynamicEnumField descriptor
   */
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

  /**
   * Creates a field that loads its schema dynamically (e.g., from an extension).
   *
   * @param name - The field name (used as the schema key)
   * @param schemaSource - Identifier for the schema source
   * @param config - Optional configuration for label, etc.
   * @returns A DynamicSchemaField descriptor
   */
  dynamicSchema: <const N extends string>(
    name: N,
    schemaSource: string,
    config?: Omit<DynamicSchemaField<N>, "_type" | "_field" | "name" | "schemaSource">
  ): DynamicSchemaField<N> => ({
    _type: "field",
    _field: "dynamic_schema",
    name,
    schemaSource,
    ...config,
  }),

  /**
   * Creates an array field containing repeating items.
   *
   * Use this for lists of values (e.g., multiple addresses, line items).
   *
   * @example
   * ```typescript
   * field.array("addresses",
   *   field.text("street", { label: "Street" }),
   *   field.text("city", { label: "City" }),
   *   field.text("zip", { label: "ZIP Code" }),
   * )
   * ```
   *
   * @param name - The field name (used as the schema key)
   * @param items - The form elements that define each array item
   * @returns An ArrayField descriptor
   */
  array: <const N extends string, const Items extends readonly FormElement[]>(
    name: N,
    ...items: Items
  ): ArrayField<N, Items> => ({
    _type: "field",
    _field: "array",
    name,
    items,
  }),

  /**
   * Creates an array field with additional configuration options.
   *
   * @example
   * ```typescript
   * field.arrayWithConfig("lineItems", {
   *   label: "Line Items",
   *   minItems: 1,
   *   maxItems: 10,
   * },
   *   field.text("description"),
   *   field.number("quantity"),
   * )
   * ```
   *
   * @param name - The field name (used as the schema key)
   * @param config - Configuration for label, minItems, maxItems, etc.
   * @param items - The form elements that define each array item
   * @returns An ArrayField descriptor
   */
  arrayWithConfig: <const N extends string, const Items extends readonly FormElement[]>(
    name: N,
    config: Omit<ArrayField<N, Items>, "_type" | "_field" | "name" | "items">,
    ...items: Items
  ): ArrayField<N, Items> => ({
    _type: "field",
    _field: "array",
    name,
    items,
    ...config,
  }),

  /**
   * Creates an object field containing nested properties.
   *
   * Use this for grouping related fields under a single key in the schema.
   *
   * @example
   * ```typescript
   * field.object("address",
   *   field.text("street", { label: "Street" }),
   *   field.text("city", { label: "City" }),
   *   field.text("zip", { label: "ZIP Code" }),
   * )
   * ```
   *
   * @param name - The field name (used as the schema key)
   * @param properties - The form elements that define the object's properties
   * @returns An ObjectField descriptor
   */
  object: <const N extends string, const Properties extends readonly FormElement[]>(
    name: N,
    ...properties: Properties
  ): ObjectField<N, Properties> => ({
    _type: "field",
    _field: "object",
    name,
    properties,
  }),

  /**
   * Creates an object field with additional configuration options.
   *
   * @example
   * ```typescript
   * field.objectWithConfig("billingAddress", { label: "Billing Address", required: true },
   *   field.text("street"),
   *   field.text("city"),
   * )
   * ```
   *
   * @param name - The field name (used as the schema key)
   * @param config - Configuration for label, required, etc.
   * @param properties - The form elements that define the object's properties
   * @returns An ObjectField descriptor
   */
  objectWithConfig: <const N extends string, const Properties extends readonly FormElement[]>(
    name: N,
    config: Omit<ObjectField<N, Properties>, "_type" | "_field" | "name" | "properties">,
    ...properties: Properties
  ): ObjectField<N, Properties> => ({
    _type: "field",
    _field: "object",
    name,
    properties,
    ...config,
  }),
};
