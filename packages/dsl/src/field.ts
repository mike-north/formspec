/**
 * Field builder functions for creating form field definitions.
 *
 * Each function creates a field descriptor that captures both schema information
 * (name, type) and UI hints (label, placeholder, etc.).
 */

import type {
  ArrayField,
  BooleanField,
  DynamicEnumField,
  DynamicSchemaField,
  EnumOptionValue,
  FormElement,
  MetadataPolicyInput,
  NumberField,
  ObjectField,
  StaticEnumField,
  TextField,
} from "@formspec/core";

declare const FIELD_POLICY_BRAND: unique symbol;

type DefaultFieldPolicyBrand = { readonly __formspecDefaultFieldPolicy: true };

type FieldPolicyBrandValue<Policy> = Policy extends undefined ? DefaultFieldPolicyBrand : Policy;

export type FieldBuilderElement<
  Policy,
  Element extends FormElement = FormElement,
> = Element & {
  readonly [FIELD_POLICY_BRAND]: FieldPolicyBrandValue<Policy>;
};

type FieldBuilderInputElement<Policy> = Policy extends undefined
  ? FormElement
  : FieldBuilderElement<Policy>;

type FieldMetadataPolicy<Policy> = Policy extends { readonly field?: infer FieldPolicy }
  ? FieldPolicy
  : undefined;

type IsRequiredMetadata<
  Policy,
  Key extends "apiName" | "displayName",
> = FieldMetadataPolicy<Policy> extends Record<string, unknown>
  ? FieldMetadataPolicy<Policy>[Key] extends { readonly mode: "require-explicit" }
    ? true
    : false
  : false;

type LabelDisplayNameConfig<Required extends boolean> = Required extends true
  ?
      | { readonly label: string; readonly displayName?: never }
      | { readonly label?: never; readonly displayName: string }
  :
      | { readonly label?: string; readonly displayName?: never }
      | { readonly label?: never; readonly displayName?: string }
      | { readonly label?: undefined; readonly displayName?: undefined };

type ApiNameConfig<Required extends boolean> = Required extends true
  ? { readonly apiName: string }
  : { readonly apiName?: string };

type HasRequiredMetadata<Policy> = IsRequiredMetadata<Policy, "apiName"> extends true
  ? true
  : IsRequiredMetadata<Policy, "displayName"> extends true
    ? true
    : false;

type MetadataAwareFieldConfig<
  BaseConfig,
  Policy,
> = Omit<BaseConfig, "label" | "displayName" | "apiName"> &
  ApiNameConfig<IsRequiredMetadata<Policy, "apiName">> &
  LabelDisplayNameConfig<IsRequiredMetadata<Policy, "displayName">>;

type MaybeRequiredConfigArg<Config, Policy> = HasRequiredMetadata<Policy> extends true
  ? readonly [config: Config]
  : readonly [config?: Config];

type ArrayBuilderArgs<
  N extends string,
  Items extends readonly FieldBuilderInputElement<Policy>[],
  Policy,
> = HasRequiredMetadata<Policy> extends true
  ? readonly [config: ArrayFieldConfig<N, Items, Policy>, ...items: Items]
  :
      | readonly [...items: Items]
      | readonly [config: ArrayFieldConfig<N, Items, Policy>, ...items: Items];

type ObjectBuilderArgs<
  N extends string,
  Properties extends readonly FieldBuilderInputElement<Policy>[],
  Policy,
> = HasRequiredMetadata<Policy> extends true
  ? readonly [config: ObjectFieldConfig<N, Properties, Policy>, ...properties: Properties]
  :
      | readonly [...properties: Properties]
      | readonly [config: ObjectFieldConfig<N, Properties, Policy>, ...properties: Properties];

type TextFieldConfig<N extends string, Policy> = MetadataAwareFieldConfig<
  Omit<TextField<N>, "_type" | "_field" | "name">,
  Policy
>;

type NumberFieldConfig<N extends string, Policy> = MetadataAwareFieldConfig<
  Omit<NumberField<N>, "_type" | "_field" | "name">,
  Policy
>;

type BooleanFieldConfig<N extends string, Policy> = MetadataAwareFieldConfig<
  Omit<BooleanField<N>, "_type" | "_field" | "name">,
  Policy
>;

type StaticEnumFieldConfig<
  N extends string,
  O extends readonly EnumOptionValue[],
  Policy,
> = MetadataAwareFieldConfig<Omit<StaticEnumField<N, O>, "_type" | "_field" | "name" | "options">, Policy>;

type DynamicEnumFieldConfig<N extends string, Source extends string, Policy> = MetadataAwareFieldConfig<
  Omit<DynamicEnumField<N, Source>, "_type" | "_field" | "name" | "source">,
  Policy
>;

type DynamicSchemaFieldConfig<N extends string, Policy> = MetadataAwareFieldConfig<
  Omit<DynamicSchemaField<N>, "_type" | "_field" | "name" | "schemaSource">,
  Policy
>;

type ArrayFieldConfig<N extends string, Items extends readonly FormElement[], Policy> =
  MetadataAwareFieldConfig<Omit<ArrayField<N, Items>, "_type" | "_field" | "name" | "items">, Policy>;

type ObjectFieldConfig<N extends string, Properties extends readonly FormElement[], Policy> =
  MetadataAwareFieldConfig<
    Omit<ObjectField<N, Properties>, "_type" | "_field" | "name" | "properties">,
    Policy
  >;

/**
 * Namespace of field builder functions produced by the DSL.
 *
 * @public
 */
export interface FieldBuilderNamespace<Policy extends MetadataPolicyInput | undefined = undefined> {
  /** Builds a text field. */
  readonly text: <const N extends string>(
    name: N,
    ...args: MaybeRequiredConfigArg<TextFieldConfig<N, Policy>, Policy>
  ) => FieldBuilderElement<Policy, TextField<N>>;
  /** Builds a number field. */
  readonly number: <const N extends string>(
    name: N,
    ...args: MaybeRequiredConfigArg<NumberFieldConfig<N, Policy>, Policy>
  ) => FieldBuilderElement<Policy, NumberField<N>>;
  /** Builds a boolean field. */
  readonly boolean: <const N extends string>(
    name: N,
    ...args: MaybeRequiredConfigArg<BooleanFieldConfig<N, Policy>, Policy>
  ) => FieldBuilderElement<Policy, BooleanField<N>>;
  /** Builds a static enum field. */
  readonly enum: <const N extends string, const O extends readonly EnumOptionValue[]>(
    name: N,
    options: O,
    ...args: MaybeRequiredConfigArg<StaticEnumFieldConfig<N, O, Policy>, Policy>
  ) => FieldBuilderElement<Policy, StaticEnumField<N, O>>;
  /** Builds a dynamic enum field. */
  readonly dynamicEnum: <const N extends string, const Source extends string>(
    name: N,
    source: Source,
    ...args: MaybeRequiredConfigArg<DynamicEnumFieldConfig<N, Source, Policy>, Policy>
  ) => FieldBuilderElement<Policy, DynamicEnumField<N, Source>>;
  /** Builds a dynamic schema field. */
  readonly dynamicSchema: <const N extends string>(
    name: N,
    schemaSource: string,
    ...args: MaybeRequiredConfigArg<DynamicSchemaFieldConfig<N, Policy>, Policy>
  ) => FieldBuilderElement<Policy, DynamicSchemaField<N>>;
  /** Builds an array field, optionally with config as the second argument. */
  readonly array: <const N extends string, const Items extends readonly FieldBuilderInputElement<Policy>[]>(
    name: N,
    ...args: ArrayBuilderArgs<N, Items, Policy>
  ) => FieldBuilderElement<Policy, ArrayField<N, Items>>;
  /** Builds an array field with an explicit config object. */
  readonly arrayWithConfig: <const N extends string, const Items extends readonly FieldBuilderInputElement<Policy>[]>(
    name: N,
    config: ArrayFieldConfig<N, Items, Policy>,
    ...items: Items
  ) => FieldBuilderElement<Policy, ArrayField<N, Items>>;
  /** Builds an object field, optionally with config as the second argument. */
  readonly object: <const N extends string, const Properties extends readonly FieldBuilderInputElement<Policy>[]>(
    name: N,
    ...args: ObjectBuilderArgs<N, Properties, Policy>
  ) => FieldBuilderElement<Policy, ObjectField<N, Properties>>;
  /** Builds an object field with an explicit config object. */
  readonly objectWithConfig: <const N extends string, const Properties extends readonly FieldBuilderInputElement<Policy>[]>(
    name: N,
    config: ObjectFieldConfig<N, Properties, Policy>,
    ...properties: Properties
  ) => FieldBuilderElement<Policy, ObjectField<N, Properties>>;
}

function assertCompatibleDisplayNameAlias(
  builderName: string,
  config:
    | { readonly label?: string | undefined; readonly displayName?: string | undefined }
    | undefined
): void {
  if (config?.label !== undefined && config.displayName !== undefined) {
    throw new Error(
      `field.${builderName}(): pass either "label" or "displayName", not both. They are aliases for the same metadata.`
    );
  }
}

function isFieldConfigArgument(value: unknown): value is {
  readonly label?: string;
  readonly displayName?: string;
  readonly apiName?: string;
} {
  return typeof value === "object" && value !== null && !("_type" in value);
}

function compactConfig<T extends Record<string, unknown> | undefined>(
  config: T
): Partial<NonNullable<T>> {
  if (config === undefined) {
    return {};
  }

  const entries = Object.entries(config).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries) as Partial<NonNullable<T>>;
}

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
 *
 * @public
 */
export function createFieldBuilders<
  const Policy extends MetadataPolicyInput | undefined = undefined,
>(): FieldBuilderNamespace<Policy> {
  return {
    text: <const N extends string>(
      name: N,
      ...args: MaybeRequiredConfigArg<TextFieldConfig<N, Policy>, Policy>
    ): FieldBuilderElement<Policy, TextField<N>> => {
      const [config] = args;
      assertCompatibleDisplayNameAlias("text", config);
      return {
        _type: "field",
        _field: "text",
        name,
        ...compactConfig(config),
      } as unknown as FieldBuilderElement<Policy, TextField<N>>;
    },

    number: <const N extends string>(
      name: N,
      ...args: MaybeRequiredConfigArg<NumberFieldConfig<N, Policy>, Policy>
    ): FieldBuilderElement<Policy, NumberField<N>> => {
      const [config] = args;
      assertCompatibleDisplayNameAlias("number", config);
      return {
        _type: "field",
        _field: "number",
        name,
        ...compactConfig(config),
      } as unknown as FieldBuilderElement<Policy, NumberField<N>>;
    },

    boolean: <const N extends string>(
      name: N,
      ...args: MaybeRequiredConfigArg<BooleanFieldConfig<N, Policy>, Policy>
    ): FieldBuilderElement<Policy, BooleanField<N>> => {
      const [config] = args;
      assertCompatibleDisplayNameAlias("boolean", config);
      return {
        _type: "field",
        _field: "boolean",
        name,
        ...compactConfig(config),
      } as unknown as FieldBuilderElement<Policy, BooleanField<N>>;
    },

    enum: <const N extends string, const O extends readonly EnumOptionValue[]>(
      name: N,
      options: O,
      ...args: MaybeRequiredConfigArg<StaticEnumFieldConfig<N, O, Policy>, Policy>
    ): FieldBuilderElement<Policy, StaticEnumField<N, O>> => {
      const [config] = args;
      assertCompatibleDisplayNameAlias("enum", config);

      if (options.length > 0) {
        const first = options[0];
        const firstIsObject = typeof first === "object" && first !== null;

        for (const opt of options) {
          const optIsObject = typeof opt === "object" && opt !== null;
          if (optIsObject !== firstIsObject) {
            throw new Error(
              `field.enum("${name}"): options must be all strings or all objects with {id, label}, not mixed. ` +
                `Received mixed types in options array.`
            );
          }
        }

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
        ...compactConfig(config),
      } as unknown as FieldBuilderElement<Policy, StaticEnumField<N, O>>;
    },

    dynamicEnum: <const N extends string, const Source extends string>(
      name: N,
      source: Source,
      ...args: MaybeRequiredConfigArg<DynamicEnumFieldConfig<N, Source, Policy>, Policy>
    ): FieldBuilderElement<Policy, DynamicEnumField<N, Source>> => {
      const [config] = args;
      assertCompatibleDisplayNameAlias("dynamicEnum", config);
      return {
        _type: "field",
        _field: "dynamic_enum",
        name,
        source,
        ...compactConfig(config),
      } as unknown as FieldBuilderElement<Policy, DynamicEnumField<N, Source>>;
    },

    dynamicSchema: <const N extends string>(
      name: N,
      schemaSource: string,
      ...args: MaybeRequiredConfigArg<DynamicSchemaFieldConfig<N, Policy>, Policy>
    ): FieldBuilderElement<Policy, DynamicSchemaField<N>> => {
      const [config] = args;
      assertCompatibleDisplayNameAlias("dynamicSchema", config);
      return {
        _type: "field",
        _field: "dynamic_schema",
        name,
        schemaSource,
        ...compactConfig(config),
      } as unknown as FieldBuilderElement<Policy, DynamicSchemaField<N>>;
    },

    array: <const N extends string, const Items extends readonly FieldBuilderInputElement<Policy>[]>(
      name: N,
      ...args: ArrayBuilderArgs<N, Items, Policy>
    ): FieldBuilderElement<Policy, ArrayField<N, Items>> => {
      const [firstArg, ...restArgs] = args;
      const config = isFieldConfigArgument(firstArg)
        ? (firstArg as unknown as ArrayFieldConfig<N, Items, Policy>)
        : undefined;
      const items = (config === undefined ? args : restArgs) as unknown as Items;
      assertCompatibleDisplayNameAlias("array", config);
      return {
        _type: "field",
        _field: "array",
        name,
        items,
        ...compactConfig(config),
      } as unknown as FieldBuilderElement<Policy, ArrayField<N, Items>>;
    },

    arrayWithConfig: <const N extends string, const Items extends readonly FieldBuilderInputElement<Policy>[]>(
      name: N,
      config: ArrayFieldConfig<N, Items, Policy>,
      ...items: Items
    ): FieldBuilderElement<Policy, ArrayField<N, Items>> => {
      assertCompatibleDisplayNameAlias("arrayWithConfig", config);
      return {
        _type: "field",
        _field: "array",
        name,
        items,
        ...compactConfig(config),
      } as unknown as FieldBuilderElement<Policy, ArrayField<N, Items>>;
    },

    object: <const N extends string, const Properties extends readonly FieldBuilderInputElement<Policy>[]>(
      name: N,
      ...args: ObjectBuilderArgs<N, Properties, Policy>
    ): FieldBuilderElement<Policy, ObjectField<N, Properties>> => {
      const [firstArg, ...restArgs] = args;
      const config = isFieldConfigArgument(firstArg)
        ? (firstArg as unknown as ObjectFieldConfig<N, Properties, Policy>)
        : undefined;
      const properties = (config === undefined ? args : restArgs) as unknown as Properties;
      assertCompatibleDisplayNameAlias("object", config);
      return {
        _type: "field",
        _field: "object",
        name,
        properties,
        ...compactConfig(config),
      } as unknown as FieldBuilderElement<Policy, ObjectField<N, Properties>>;
    },

    objectWithConfig: <const N extends string, const Properties extends readonly FieldBuilderInputElement<Policy>[]>(
      name: N,
      config: ObjectFieldConfig<N, Properties, Policy>,
      ...properties: Properties
    ): FieldBuilderElement<Policy, ObjectField<N, Properties>> => {
      assertCompatibleDisplayNameAlias("objectWithConfig", config);
      return {
        _type: "field",
        _field: "object",
        name,
        properties,
        ...compactConfig(config),
      } as unknown as FieldBuilderElement<Policy, ObjectField<N, Properties>>;
    },
  };
}

/**
 * Field builder namespace containing functions to create each field type.
 *
 * @public
 */
export const field = createFieldBuilders();
