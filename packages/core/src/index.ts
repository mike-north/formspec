/**
 * `@formspec/core` - Core type definitions for FormSpec
 *
 * This package provides the foundational types used throughout the FormSpec ecosystem:
 * - Form element types (fields, groups, conditionals)
 * - Field and form state types
 * - Data source registry for dynamic enums
 *
 * @packageDocumentation
 */

// Re-export all types
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

  // Predicates
  EqualsPredicate,
  Predicate,
} from "./types/index.js";

// Re-export functions
export { createInitialFieldState } from "./types/index.js";
