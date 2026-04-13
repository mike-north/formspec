/**
 * `@formspec/dsl` - DSL functions for defining FormSpec forms
 *
 * This package provides the builder functions for creating form specifications:
 * - `field.*` - Field builders (text, number, boolean, enum, dynamicEnum)
 * - `group()` - Visual grouping
 * - `when()` + `is()` - Conditional visibility
 * - `formspec()` - Top-level form definition
 *
 * @example
 * ```typescript
 * import { formspec, field, group, when, is } from "@formspec/dsl";
 *
 * const InvoiceForm = formspec(
 *   group("Customer",
 *     field.text("customerName", { label: "Customer Name" }),
 *     field.dynamicEnum("country", "fetch_countries", { label: "Country" }),
 *   ),
 *   group("Invoice Details",
 *     field.number("amount", { label: "Amount", min: 0 }),
 *     field.enum("status", ["draft", "sent", "paid"] as const),
 *     when(is("status", "draft"),
 *       field.text("internalNotes", { label: "Internal Notes" }),
 *     ),
 *   ),
 * );
 * ```
 *
 * @packageDocumentation
 */

// Field builders
export { field, createFieldBuilders } from "./field.js";
export type {
  ApiNameConfig,
  ArrayBuilderArgs,
  ArrayFieldConfig,
  BooleanFieldConfig,
  FieldMetadataPolicy,
  DynamicEnumFieldConfig,
  DynamicSchemaFieldConfig,
  FieldBuilderElement,
  FieldBuilderInputElement,
  FieldBuilderNamespace,
  HasRequiredMetadata,
  IsRequiredMetadata,
  LabelDisplayNameConfig,
  MaybeRequiredConfigArg,
  MetadataAwareFieldConfig,
  NumberFieldConfig,
  ObjectBuilderArgs,
  ObjectFieldConfig,
  StaticEnumFieldConfig,
  TextFieldConfig,
} from "./field.js";
export { createFormSpecFactory } from "./factory.js";
export type { FormSpecFactory } from "./factory.js";

// Predicate builders
export { is } from "./predicate.js";

// Structure builders
export { group, when, formspec, formspecWithValidation } from "./structure.js";
export type { FormSpecOptions } from "./structure.js";

// Validation
export { validateForm, logValidationIssues } from "./validation.js";
export type { ValidationSeverity, ValidationIssue, ValidationResult } from "./validation.js";

// Type inference utilities
export type {
  InferFieldValue,
  ExtractFields,
  ExtractFieldsFromArray,
  ExtractNonConditionalFields,
  ExtractNonConditionalFieldsFromArray,
  ExtractConditionalFields,
  ExtractConditionalFieldsFromArray,
  BuildSchema,
  FlattenIntersection,
  InferSchema,
  InferFormSchema,
} from "./inference.js";

// Re-export enum option types from core for convenience
export type {
  AnyField,
  ArrayField,
  BooleanField,
  Conditional,
  DeclarationMetadataPolicyInput,
  DataSourceRegistry,
  DataSourceValueType,
  DynamicEnumField,
  DynamicSchemaField,
  EnumOption,
  EnumOptionValue,
  EqualsPredicate,
  FormElement,
  FormSpec,
  Group,
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
  NumberField,
  ObjectField,
  Predicate,
  ResolvedMetadata,
  ResolvedScalarMetadata,
  StaticEnumField,
  TextField,
  MetadataPolicyInput,
} from "@formspec/core";
