/**
 * `@formspec/core` - Core type definitions for FormSpec
 *
 * This package provides the foundational types used throughout the FormSpec ecosystem:
 * - Form element types (fields, groups, conditionals)
 * - Field and form state types
 * - Data source registry for dynamic enums
 * - Canonical IR types (FormIR, FieldNode, TypeNode, ConstraintNode, AnnotationNode, etc.)
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
  EnumOption,
  EnumOptionValue,
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

  // Built-in constraints
  BuiltinConstraintName,

  // Canonical IR
  JsonValue,
  Provenance,
  PathTarget,
  TypeNode,
  PrimitiveTypeNode,
  EnumMember,
  EnumTypeNode,
  ArrayTypeNode,
  ObjectProperty,
  ObjectTypeNode,
  RecordTypeNode,
  UnionTypeNode,
  ReferenceTypeNode,
  DynamicTypeNode,
  CustomTypeNode,
  ConstraintNode,
  NumericConstraintNode,
  LengthConstraintNode,
  PatternConstraintNode,
  ArrayCardinalityConstraintNode,
  EnumMemberConstraintNode,
  CustomConstraintNode,
  AnnotationNode,
  DisplayNameAnnotationNode,
  DescriptionAnnotationNode,
  PlaceholderAnnotationNode,
  DefaultValueAnnotationNode,
  DeprecatedAnnotationNode,
  FormatHintAnnotationNode,
  CustomAnnotationNode,
  FieldNode,
  LayoutNode,
  GroupLayoutNode,
  ConditionalLayoutNode,
  FormIRElement,
  TypeDefinition,
  FormIR,
} from "./types/index.js";

// Re-export functions and constants
export {
  createInitialFieldState,
  BUILTIN_CONSTRAINT_DEFINITIONS,
  normalizeConstraintTagName,
  isBuiltinConstraintName,
  IR_VERSION,
} from "./types/index.js";

// Extension API
export type {
  ExtensionDefinition,
  CustomTypeRegistration,
  CustomConstraintRegistration,
  CustomAnnotationRegistration,
  VocabularyKeywordRegistration,
} from "./extensions/index.js";

export {
  defineExtension,
  defineCustomType,
  defineConstraint,
  defineAnnotation,
} from "./extensions/index.js";

// Re-export type guards
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
} from "./guards.js";
