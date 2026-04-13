/**
 * FormSpec - Type-safe form specifications
 *
 * This package re-exports everything from the FormSpec library for convenience.
 * You can import everything you need from a single package:
 *
 * @example
 * ```typescript
 * import {
 *   // DSL functions
 *   formspec, field, group, when, is,
 *   // Type inference
 *   type InferSchema,
 *   // Schema generation
 *   buildFormSchemas,
 *   // Resolvers
 *   defineResolvers,
 *   // Core types
 *   type FormSpec, type FormElement,
 * } from "formspec";
 *
 * // Define a form
 * const InvoiceForm = formspec(
 *   group("Customer",
 *     field.text("name", { label: "Name", required: true }),
 *     field.dynamicEnum("country", "fetch_countries", { label: "Country" }),
 *   ),
 *   group("Details",
 *     field.number("amount", { label: "Amount", min: 0 }),
 *     field.enum("status", ["draft", "sent", "paid"]),
 *     when(is("status", "draft"),
 *       field.text("notes", { label: "Internal Notes" }),
 *     ),
 *   ),
 * );
 *
 * // Infer the schema type
 * type Schema = InferSchema<typeof InvoiceForm.elements>;
 *
 * // Generate JSON Schema and UI Schema
 * const { jsonSchema, uiSchema } = buildFormSchemas(InvoiceForm);
 *
 * // Define resolvers for dynamic data
 * const resolvers = defineResolvers(InvoiceForm, {
 *   fetch_countries: async () => ({
 *     options: [{ value: "us", label: "United States" }],
 *     validity: "valid",
 *   }),
 * });
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// Core types
// =============================================================================

import type {
  AnyField,
  ArrayField,
  BooleanField,
  Conditional,
  DataSourceValueType,
  DynamicEnumField,
  DynamicSchemaField,
  EnumOption,
  EnumOptionValue,
  EqualsPredicate,
  FormElement,
  FormSpec,
  Group,
  NumberField,
  ObjectField,
  Predicate,
  StaticEnumField,
  TextField,
} from "@formspec/core";

export type {
  // Validity
  Validity,

  // Field state
  FieldState,

  // Form state
  FormState,

  // Data sources
  DataSourceRegistry,
  DataSourceOption,
  FetchOptionsResponse,
  DataSourceValueType,
  // Elements
  TextField,
  NumberField,
  BooleanField,
  EnumOption,
  EnumOptionValue,
  StaticEnumField,
  DynamicEnumField,
  DynamicSchemaField,
  MetadataPolicyInput,
  MetadataAuthoringSurface,
  MetadataDeclarationKind,
  MetadataInferenceContext,
  MetadataInferenceFn,
  EnumMemberMetadataInferenceContext,
  EnumMemberMetadataInferenceFn,
  MetadataPluralizationContext,
  MetadataPluralizationDisabledPolicyInput,
  MetadataPluralizationFn,
  MetadataPluralizationInferIfMissingPolicyInput,
  MetadataPluralizationPolicyInput,
  MetadataPluralizationRequireExplicitPolicyInput,
  MetadataResolutionMode,
  MetadataSource,
  MetadataValueDisabledPolicyInput,
  MetadataValueInferIfMissingPolicyInput,
  MetadataValuePolicyInput,
  MetadataValueRequireExplicitPolicyInput,
  EnumMemberDisplayNameDisabledPolicyInput,
  EnumMemberDisplayNameRequireExplicitPolicyInput,
  EnumMemberDisplayNameInferIfMissingPolicyInput,
  EnumMemberDisplayNamePolicyInput,
  EnumMemberMetadataPolicyInput,
  ResolvedMetadata,
  ResolvedScalarMetadata,
  ArrayField,
  ObjectField,
  AnyField,
  Group,
  Conditional,
  DeclarationMetadataPolicyInput,
  FormElement,
  FormSpec,
  // Predicates
  EqualsPredicate,
  Predicate,
} from "@formspec/core";

export { createInitialFieldState } from "@formspec/core";

// Type guards
export {
  isField,
  isTextField,
  isNumberField,
  isBooleanField,
  isStaticEnumField,
  isDynamicEnumField,
  isDynamicSchemaField,
  isArrayField,
  isObjectField,
  isGroup,
  isConditional,
} from "@formspec/core";

// =============================================================================
// DSL functions
// =============================================================================

export { logValidationIssues } from "@formspec/dsl";
import {
  field as dslField,
  group as dslGroup,
  when as dslWhen,
  is as dslIs,
  formspec as dslFormspec,
  formspecWithValidation as dslFormspecWithValidation,
  validateForm as dslValidateForm,
  type FormSpecOptions,
} from "@formspec/dsl";
export type {
  // Validation
  FormSpecOptions,
  ValidationSeverity,
  ValidationIssue,
  ValidationResult,
} from "@formspec/dsl";
import type { ValidationResult } from "@formspec/dsl";

/**
 * Field builder helpers re-exported by the top-level `formspec` package.
 *
 * @public
 */
export interface FormSpecFieldBuilder {
  /** Creates a text field. */
  text<const N extends string>(
    name: N,
    config?: Omit<TextField<N>, "_type" | "_field" | "name">
  ): TextField<N>;
  /** Creates a number field. */
  number<const N extends string>(
    name: N,
    config?: Omit<NumberField<N>, "_type" | "_field" | "name">
  ): NumberField<N>;
  /** Creates a boolean field. */
  boolean<const N extends string>(
    name: N,
    config?: Omit<BooleanField<N>, "_type" | "_field" | "name">
  ): BooleanField<N>;
  /** Creates a static enum field from a fixed options list. */
  enum<const N extends string, const O extends readonly EnumOptionValue[]>(
    name: N,
    options: O,
    config?: Omit<StaticEnumField<N, O>, "_type" | "_field" | "name" | "options">
  ): StaticEnumField<N, O>;
  /** Creates a dynamic enum field backed by an external option source. */
  dynamicEnum<const N extends string, const Source extends string>(
    name: N,
    source: Source,
    config?: Omit<DynamicEnumField<N, Source>, "_type" | "_field" | "name" | "source">
  ): DynamicEnumField<N, Source>;
  /** Creates a field whose schema is resolved from an external source at runtime. */
  dynamicSchema<const N extends string>(
    name: N,
    schemaSource: string,
    config?: Omit<DynamicSchemaField<N>, "_type" | "_field" | "name" | "schemaSource">
  ): DynamicSchemaField<N>;
  /** Creates an array field from a list of item elements. */
  array<const N extends string, const Items extends readonly FormElement[]>(
    name: N,
    ...items: Items
  ): ArrayField<N, Items>;
  /** Creates an array field with explicit configuration and item elements. */
  arrayWithConfig<const N extends string, const Items extends readonly FormElement[]>(
    name: N,
    config: Omit<ArrayField<N, Items>, "_type" | "_field" | "name" | "items">,
    ...items: Items
  ): ArrayField<N, Items>;
  /** Creates an object field from a list of property elements. */
  object<const N extends string, const Properties extends readonly FormElement[]>(
    name: N,
    ...properties: Properties
  ): ObjectField<N, Properties>;
  /** Creates an object field with explicit configuration and property elements. */
  objectWithConfig<const N extends string, const Properties extends readonly FormElement[]>(
    name: N,
    config: Omit<ObjectField<N, Properties>, "_type" | "_field" | "name" | "properties">,
    ...properties: Properties
  ): ObjectField<N, Properties>;
}

/**
 * Field builder helpers that preserve this package's exported type identities.
 *
 * @public
 */
export const field = dslField as unknown as FormSpecFieldBuilder;

// =============================================================================
// Build tools
// =============================================================================

import {
  buildFormSchemas as buildFormSchemasInternal,
  generateJsonSchema as generateJsonSchemaInternal,
  generateUiSchema as generateUiSchemaInternal,
  writeSchemas as writeSchemasInternal,
  type BuildFormSchemasOptions,
  type BuildResult,
  type GenerateJsonSchemaOptions,
  type GenerateUiSchemaOptions,
  type JsonSchema2020,
  type UISchema,
  type WriteSchemasOptions,
  type WriteSchemasResult,
} from "@formspec/build";

export type {
  BuildFormSchemasOptions,
  GenerateJsonSchemaOptions,
  GenerateUiSchemaOptions,
  JsonSchema2020,
  UISchema,
  UISchemaElement,
  ControlElement,
  VerticalLayout,
  HorizontalLayout,
  GroupLayout,
  Categorization,
  Category,
  LabelElement,
  Rule,
  RuleEffect,
  RuleConditionSchema,
  SchemaBasedCondition,
  BuildResult,
  WriteSchemasOptions,
  WriteSchemasResult,
} from "@formspec/build";

// =============================================================================
// Runtime helpers
// =============================================================================

import {
  defineResolvers as defineResolversInternal,
  type ResolverMap,
  type ResolverRegistry,
  type ResolverSourcesForForm,
} from "@formspec/runtime";

export type {
  ExtractDynamicSources,
  ExtractDynamicSourcesFromArray,
  Resolver,
  ResolverMap,
  ResolverRegistry,
  ResolverSourcesForForm,
} from "@formspec/runtime";

// =============================================================================
// Local DSL wrappers and inference helpers
// =============================================================================

/**
 * Creates a visual group of form elements.
 *
 * @public
 */
export function group<const Elements extends readonly FormElement[]>(
  label: string,
  ...elements: Elements
): Group<Elements> {
  return dslGroup(label, ...elements);
}

/**
 * Creates a conditional wrapper that shows elements based on a predicate.
 *
 * @public
 */
export function when<
  const K extends string,
  const V,
  const Elements extends readonly FormElement[],
>(predicate: Predicate<K, V>, ...elements: Elements): Conditional<K, V, Elements> {
  return dslWhen(predicate, ...elements);
}

/**
 * Creates an equality predicate that checks if a field equals a specific value.
 *
 * @public
 */
export function is<const K extends string, const V>(field: K, value: V): EqualsPredicate<K, V> {
  return dslIs(field, value);
}

/**
 * Creates a complete form specification.
 *
 * @public
 */
export function formspec<const Elements extends readonly FormElement[]>(
  ...elements: Elements
): FormSpec<Elements> {
  return dslFormspec(...elements);
}

/**
 * Creates a complete form specification with validation options.
 *
 * @public
 */
export function formspecWithValidation<const Elements extends readonly FormElement[]>(
  options: FormSpecOptions,
  ...elements: Elements
): FormSpec<Elements> {
  return dslFormspecWithValidation(options, ...elements);
}

/**
 * Infers the value type from a single field.
 *
 * @public
 */
export type InferFieldValue<F> =
  F extends TextField<string>
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
 * Extracts all fields from a single element.
 *
 * @public
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
 * @public
 */
export type ExtractFieldsFromArray<Elements> = Elements extends readonly [
  infer First,
  ...infer Rest,
]
  ? ExtractFields<First> | ExtractFieldsFromArray<Rest>
  : never;

/**
 * Extracts fields that are not inside conditionals.
 *
 * @public
 */
export type ExtractNonConditionalFields<E> = E extends AnyField
  ? E
  : E extends Group<infer Elements>
    ? ExtractNonConditionalFieldsFromArray<Elements>
    : E extends Conditional<string, unknown, infer _Elements>
      ? never
      : never;

/**
 * Extracts non-conditional fields from an array of elements.
 *
 * @public
 */
export type ExtractNonConditionalFieldsFromArray<Elements> = Elements extends readonly [
  infer First,
  ...infer Rest,
]
  ? ExtractNonConditionalFields<First> | ExtractNonConditionalFieldsFromArray<Rest>
  : never;

/**
 * Extracts fields that are inside conditionals.
 *
 * @public
 */
export type ExtractConditionalFields<E> = E extends AnyField
  ? never
  : E extends Group<infer Elements>
    ? ExtractConditionalFieldsFromArray<Elements>
    : E extends Conditional<string, unknown, infer Elements>
      ? ExtractFieldsFromArray<Elements>
      : never;

/**
 * Extracts conditional fields from an array of elements.
 *
 * @public
 */
export type ExtractConditionalFieldsFromArray<Elements> = Elements extends readonly [
  infer First,
  ...infer Rest,
]
  ? ExtractConditionalFields<First> | ExtractConditionalFieldsFromArray<Rest>
  : never;

/**
 * Builds a schema type from extracted fields.
 *
 * @public
 */
export type BuildSchema<Fields> = {
  [N in Fields extends { name: infer K extends string } ? K : never]: InferFieldValue<
    Extract<Fields, { name: N } & AnyField>
  >;
};

/**
 * Utility type that flattens intersection types.
 *
 * @public
 */
export type FlattenIntersection<T> = {
  [K in keyof T]: T[K];
} & {};

/**
 * Infers the schema type from an array of form elements.
 *
 * @public
 */
export type InferSchema<Elements extends readonly FormElement[]> = FlattenIntersection<
  BuildSchema<ExtractNonConditionalFieldsFromArray<Elements>> &
    Partial<BuildSchema<ExtractConditionalFieldsFromArray<Elements>>>
>;

/**
 * Infers the schema type from a FormSpec.
 *
 * @public
 */
export type InferFormSchema<F extends FormSpec<readonly FormElement[]>> =
  F extends FormSpec<infer Elements> ? InferSchema<Elements> : never;

/**
 * Generates a JSON Schema 2020-12 from a FormSpec.
 *
 * @public
 */
export function generateJsonSchema<E extends readonly FormElement[]>(
  form: FormSpec<E>,
  options?: GenerateJsonSchemaOptions
): JsonSchema2020 {
  return generateJsonSchemaInternal(form, options);
}

/**
 * Generates a UI schema from a FormSpec.
 *
 * @public
 */
export function generateUiSchema<E extends readonly FormElement[]>(
  form: FormSpec<E>,
  options?: GenerateUiSchemaOptions
): UISchema {
  return generateUiSchemaInternal(form, options);
}

/**
 * Builds both JSON Schema and UI Schema from a FormSpec.
 *
 * @public
 */
export function buildFormSchemas<E extends readonly FormElement[]>(
  form: FormSpec<E>,
  options?: BuildFormSchemasOptions
): BuildResult {
  return buildFormSchemasInternal(form, options);
}

/**
 * Builds and writes both JSON Schema and UI Schema files to disk.
 *
 * @public
 */
export function writeSchemas<E extends readonly FormElement[]>(
  form: FormSpec<E>,
  options: WriteSchemasOptions
): WriteSchemasResult {
  return writeSchemasInternal(form, options);
}

/**
 * Defines resolvers for a form's dynamic data sources.
 *
 * @public
 */
export function defineResolvers<
  E extends readonly FormElement[],
  Sources extends string = ResolverSourcesForForm<E>,
>(form: FormSpec<E>, resolvers: ResolverMap<Sources>): ResolverRegistry<Sources> {
  return defineResolversInternal(form, resolvers);
}

/**
 * Validates a list of form elements for duplicate names and structural issues.
 *
 * @public
 */
export function validateForm(elements: readonly FormElement[]): ValidationResult {
  return dslValidateForm(elements);
}
