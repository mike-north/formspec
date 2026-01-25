/**
 * FORMSPEC DSL
 *
 * A type-safe DSL for defining form specifications.
 * Supports both static and dynamic (API-fetched) data.
 *
 * Key concepts:
 * - Static fields: Known at compile time
 * - Dynamic enums: Options fetched from API at runtime
 * - Dynamic subschemas: Field chunks from extensions, loaded at config time
 */

// =============================================================================
// DATA SOURCES (declares what dynamic data is available)
// =============================================================================

/**
 * Marker for a dynamic enum - options come from an API.
 * The type parameter is a string literal identifying the data source.
 */
interface DynamicEnum<Source extends string> {
  readonly _marker: "dynamic_enum";
  readonly source: Source;
}

/**
 * Marker for a dynamic subschema - fields come from an extension.
 * The type parameter identifies which extension provides the fields.
 */
interface DynamicSubschema<ExtensionId extends string> {
  readonly _marker: "dynamic_subschema";
  readonly extension: ExtensionId;
}

// =============================================================================
// DATA SOURCE REGISTRY (maps source names to their types)
// =============================================================================

/**
 * Extend this interface to register your dynamic data sources.
 *
 * Example:
 *   declare module "./formspec-dsl" {
 *     interface DataSourceRegistry {
 *       templates: { id: string; name: string };
 *       countries: { code: string; name: string };
 *     }
 *   }
 */
export interface DataSourceRegistry {
  // Extended by consumers
}

/**
 * Extend this interface to register extension subschemas.
 *
 * Example:
 *   declare module "./formspec-dsl" {
 *     interface ExtensionRegistry {
 *       "billing-extension": {
 *         billingAddress: string;
 *         taxId: string;
 *       };
 *     }
 *   }
 */
export interface ExtensionRegistry {
  // Extended by consumers
}

// =============================================================================
// FIELD DEFINITIONS
// =============================================================================

interface TextFieldDef {
  readonly _field: "text";
  readonly label?: string;
  readonly placeholder?: string;
}

interface NumberFieldDef {
  readonly _field: "number";
  readonly label?: string;
  readonly min?: number;
  readonly max?: number;
}

interface BooleanFieldDef {
  readonly _field: "boolean";
  readonly label?: string;
}

interface StaticEnumFieldDef<O extends readonly string[]> {
  readonly _field: "enum";
  readonly options: O;
  readonly label?: string;
  readonly format?: "dropdown" | "radio";
}

interface DynamicEnumFieldDef<Source extends string> {
  readonly _field: "dynamic_enum";
  readonly source: Source;
  readonly label?: string;
  readonly format?: "dropdown" | "radio";
  /** Optional parameters needed to fetch this enum's options */
  readonly params?: ReadonlyArray<string>;
}

type FieldDef =
  | TextFieldDef
  | NumberFieldDef
  | BooleanFieldDef
  | StaticEnumFieldDef<readonly string[]>
  | DynamicEnumFieldDef<string>;

type FieldDefs = Record<string, FieldDef>;

// =============================================================================
// TYPE INFERENCE
// =============================================================================

/** Get the value type for a data source (the ID/key type) */
type DataSourceValueType<Source extends string> =
  Source extends keyof DataSourceRegistry
    ? DataSourceRegistry[Source] extends { id: infer ID } ? ID : string
    : string;

/** Infer the TypeScript type from a field definition */
type InferFieldType<F extends FieldDef> = F extends TextFieldDef
  ? string
  : F extends NumberFieldDef
    ? number
    : F extends BooleanFieldDef
      ? boolean
      : F extends StaticEnumFieldDef<infer O>
        ? O[number]
        : F extends DynamicEnumFieldDef<infer Source>
          ? DataSourceValueType<Source>
          : never;

/** Infer the full schema type from field definitions */
type InferSchema<F extends FieldDefs> = {
  [K in keyof F]: InferFieldType<F[K]>;
};

/** Merge extension schema into base schema */
type WithExtension<Base, ExtId extends string> =
  ExtId extends keyof ExtensionRegistry
    ? Base & ExtensionRegistry[ExtId]
    : Base;

// =============================================================================
// FIELD BUILDERS
// =============================================================================

export const field = {
  text: (config?: Omit<TextFieldDef, "_field">): TextFieldDef => ({
    _field: "text",
    ...config,
  }),

  number: (config?: Omit<NumberFieldDef, "_field">): NumberFieldDef => ({
    _field: "number",
    ...config,
  }),

  boolean: (config?: Omit<BooleanFieldDef, "_field">): BooleanFieldDef => ({
    _field: "boolean",
    ...config,
  }),

  /** Static enum - options known at compile time */
  enum: <const O extends readonly string[]>(
    options: O,
    config?: Omit<StaticEnumFieldDef<O>, "_field" | "options">
  ): StaticEnumFieldDef<O> => ({
    _field: "enum",
    options,
    ...config,
  }),

  /**
   * Dynamic enum - options fetched from a data source at runtime.
   *
   * @param source - The data source key (must be registered in DataSourceRegistry)
   * @param config - Optional configuration including params needed to fetch
   */
  dynamicEnum: <const Source extends string>(
    source: Source,
    config?: Omit<DynamicEnumFieldDef<Source>, "_field" | "source">
  ): DynamicEnumFieldDef<Source> => ({
    _field: "dynamic_enum",
    source,
    ...config,
  }),
};

// =============================================================================
// UI ELEMENTS
// =============================================================================

interface Control<K extends string> {
  readonly _ui: "control";
  readonly field: K;
  readonly label?: string;
}

interface Group<Schema> {
  readonly _ui: "group";
  readonly label: string;
  readonly elements: ReadonlyArray<UIElement<Schema>>;
}

interface Conditional<Schema, K extends keyof Schema & string> {
  readonly _ui: "conditional";
  readonly effect: "show" | "hide" | "enable" | "disable";
  readonly field: K;
  readonly value: Schema[K];
  readonly elements: ReadonlyArray<UIElement<Schema>>;
}

/** Placeholder for extension-provided UI */
interface ExtensionSlot<ExtId extends string> {
  readonly _ui: "extension";
  readonly extension: ExtId;
}

type UIElement<Schema> =
  | Control<keyof Schema & string>
  | Group<Schema>
  | Conditional<Schema, keyof Schema & string>
  | ExtensionSlot<string>;

// =============================================================================
// UI BUILDERS
// =============================================================================

interface UIBuilders<Schema> {
  control: <K extends keyof Schema & string>(
    field: K,
    config?: { label?: string }
  ) => Control<K>;

  group: (
    label: string,
    ...elements: ReadonlyArray<UIElement<Schema>>
  ) => Group<Schema>;

  when: <K extends keyof Schema & string>(
    field: K,
    value: Schema[K],
    ...elements: ReadonlyArray<UIElement<Schema>>
  ) => Conditional<Schema, K>;

  showWhen: <K extends keyof Schema & string>(
    field: K,
    value: Schema[K],
    ...elements: ReadonlyArray<UIElement<Schema>>
  ) => Conditional<Schema, K>;

  hideWhen: <K extends keyof Schema & string>(
    field: K,
    value: Schema[K],
    ...elements: ReadonlyArray<UIElement<Schema>>
  ) => Conditional<Schema, K>;

  enableWhen: <K extends keyof Schema & string>(
    field: K,
    value: Schema[K],
    ...elements: ReadonlyArray<UIElement<Schema>>
  ) => Conditional<Schema, K>;

  disableWhen: <K extends keyof Schema & string>(
    field: K,
    value: Schema[K],
    ...elements: ReadonlyArray<UIElement<Schema>>
  ) => Conditional<Schema, K>;

  /** Insert extension-provided fields here */
  extension: <ExtId extends string>(id: ExtId) => ExtensionSlot<ExtId>;
}

function createUIBuilders<Schema>(): UIBuilders<Schema> {
  return {
    control: (fld, config) => ({ _ui: "control", field: fld, ...config }),
    group: (label, ...elements) => ({ _ui: "group", label, elements }),
    when: (fld, value, ...elements) => ({ _ui: "conditional", effect: "show", field: fld, value, elements }),
    showWhen: (fld, value, ...elements) => ({ _ui: "conditional", effect: "show", field: fld, value, elements }),
    hideWhen: (fld, value, ...elements) => ({ _ui: "conditional", effect: "hide", field: fld, value, elements }),
    enableWhen: (fld, value, ...elements) => ({ _ui: "conditional", effect: "enable", field: fld, value, elements }),
    disableWhen: (fld, value, ...elements) => ({ _ui: "conditional", effect: "disable", field: fld, value, elements }),
    extension: (id) => ({ _ui: "extension", extension: id }),
  };
}

// =============================================================================
// FORM SPEC BUILDER
// =============================================================================

interface FormSpec<F extends FieldDefs> {
  readonly fields: F;
  readonly ui: ReadonlyArray<UIElement<InferSchema<F>>>;
}

export function formspec<const F extends FieldDefs>(
  fields: F,
  buildUI: (ui: UIBuilders<InferSchema<F>>) => ReadonlyArray<UIElement<InferSchema<F>>>
): FormSpec<F> {
  return {
    fields,
    ui: buildUI(createUIBuilders<InferSchema<F>>()),
  };
}

// =============================================================================
// EXAMPLE: Register data sources and extensions
// =============================================================================

// Simulate registering data sources (in real code, this would be in a .d.ts file)
declare module "./formspec-dsl.js" {
  interface DataSourceRegistry {
    /** Template options fetched from /api/templates */
    templates: { id: string; name: string; category: string };
    /** Country list fetched from /api/countries */
    countries: { id: string; code: string; name: string };
    /** Dynamic product list, requires merchantId param */
    products: { id: string; sku: string; name: string };
  }

  interface ExtensionRegistry {
    /** Billing extension adds these fields */
    "billing-extension": {
      billingAddress: string;
      taxId: string;
      vatNumber: string;
    };
  }
}

// =============================================================================
// EXAMPLE: Form with dynamic data
// =============================================================================

const InvoiceFormSpec = formspec(
  {
    // Static fields
    customerName: field.text({ label: "Customer Name" }),
    amount: field.number({ label: "Amount", min: 0 }),

    // Dynamic enum - options fetched from API
    templateId: field.dynamicEnum("templates", {
      label: "Invoice Template",
    }),

    // Another dynamic enum
    country: field.dynamicEnum("countries", {
      label: "Country",
      format: "dropdown",
    }),

    // Dynamic enum with params (needs merchantId to fetch)
    productId: field.dynamicEnum("products", {
      label: "Product",
      params: ["merchantId"],  // Indicates this needs merchantId to fetch options
    }),

    // Static enum for comparison
    status: field.enum(["draft", "sent", "paid"] as const, {
      label: "Status",
    }),
  },

  (ui) => [
    ui.group("Customer",
      ui.control("customerName"),
      ui.control("country"),
    ),

    ui.group("Invoice Details",
      ui.control("templateId"),
      ui.control("productId"),
      ui.control("amount"),
      ui.control("status"),
    ),

    // Extension slot - billing extension fields go here
    ui.extension("billing-extension"),
  ]
);

// =============================================================================
// TYPE SAFETY VERIFICATION
// =============================================================================

// The schema type is inferred correctly:
type InvoiceSchema = InferSchema<typeof InvoiceFormSpec.fields>;
// {
//   customerName: string;
//   amount: number;
//   templateId: string;     <- from DataSourceRegistry["templates"]["id"]
//   country: string;        <- from DataSourceRegistry["countries"]["id"]
//   productId: string;      <- from DataSourceRegistry["products"]["id"]
//   status: "draft" | "sent" | "paid";
// }

// Type-safe references still work:
// formspec({ x: field.text() }, (ui) => [ui.control("wrong")]);  // Error!

// Extension fields would be merged at runtime, but we have the type info:
type FullInvoiceSchema = WithExtension<InvoiceSchema, "billing-extension">;
// Adds: billingAddress, taxId, vatNumber

export { InvoiceFormSpec };
export type { FormSpec, FieldDefs, UIElement, InferSchema };
