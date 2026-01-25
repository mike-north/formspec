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
 *   formspec, field, group, when,
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
 *     field.dynamicEnum("country", "countries", { label: "Country" }),
 *   ),
 *   group("Details",
 *     field.number("amount", { label: "Amount", min: 0 }),
 *     field.enum("status", ["draft", "sent", "paid"] as const),
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
 *   countries: async () => ({
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
  StaticEnumField,
  DynamicEnumField,
  DynamicSchemaField,
  ArrayField,
  ObjectField,
  AnyField,
  Group,
  Conditional,
  FormElement,
  FormSpec,
} from "@formspec/core";

export { createInitialFieldState } from "@formspec/core";

// =============================================================================
// DSL functions
// =============================================================================

export { field, group, when, formspec, formspecWithValidation, validateForm, logValidationIssues } from "@formspec/dsl";

export type {
  // Type inference
  InferFieldValue,
  ExtractFields,
  ExtractFieldsFromArray,
  BuildSchema,
  InferSchema,
  InferFormSchema,
  // Validation
  FormSpecOptions,
  ValidationSeverity,
  ValidationIssue,
  ValidationResult,
} from "@formspec/dsl";

// =============================================================================
// Build tools
// =============================================================================

export {
  generateJsonSchema,
  generateUiSchema,
  buildFormSchemas,
} from "@formspec/build";

export type {
  JSONSchema7,
  JSONSchemaType,
  UISchema,
  UISchemaElement,
  UISchemaElementType,
  ControlElement,
  VerticalLayout,
  HorizontalLayout,
  GroupLayout,
  Rule,
  RuleEffect,
  SchemaBasedCondition,
  BuildResult,
} from "@formspec/build";

// =============================================================================
// Runtime helpers
// =============================================================================

export { defineResolvers } from "@formspec/runtime";

export type {
  Resolver,
  ResolverMap,
  ResolverRegistry,
} from "@formspec/runtime";
