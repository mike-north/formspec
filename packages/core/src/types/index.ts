// Re-export all types from the types directory

export type { Validity } from "./validity.js";

export type { FieldState } from "./field-state.js";
export { createInitialFieldState } from "./field-state.js";

export type { FormState } from "./form-state.js";

export type {
  DataSourceRegistry,
  DataSourceOption,
  FetchOptionsResponse,
  DataSourceValueType,
} from "./data-source.js";

export type {
  MetadataSource,
  MetadataDeclarationKind,
  MetadataAuthoringSurface,
  MetadataInferenceContext,
  MetadataInferenceFn,
  MetadataPluralizationContext,
  MetadataPluralizationFn,
  ResolvedScalarMetadata,
  ResolvedMetadata,
  MetadataResolutionMode,
  MetadataPluralizationDisabledPolicyInput,
  MetadataPluralizationRequireExplicitPolicyInput,
  MetadataPluralizationInferIfMissingPolicyInput,
  MetadataPluralizationPolicyInput,
  MetadataValueDisabledPolicyInput,
  MetadataValueRequireExplicitPolicyInput,
  MetadataValueInferIfMissingPolicyInput,
  MetadataValuePolicyInput,
  DeclarationMetadataPolicyInput,
  MetadataPolicyInput,
  NormalizedMetadataPluralizationPolicy,
  NormalizedMetadataValuePolicy,
  NormalizedDeclarationMetadataPolicy,
  NormalizedMetadataPolicy,
} from "./metadata.js";

export type {
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
} from "./elements.js";

export type { EqualsPredicate, Predicate } from "./predicate.js";
export {
  _FORMSPEC_METADATA_POLICY,
  _attachFormSpecMetadataPolicy,
  _getFormSpecMetadataPolicy,
} from "./form-spec-internals.js";

export type { BuiltinConstraintName } from "./constraint-definitions.js";
export {
  _BUILTIN_CONSTRAINT_DEFINITIONS,
  _normalizeConstraintTagName,
  _isBuiltinConstraintName,
} from "./constraint-definitions.js";

export { IR_VERSION } from "./ir.js";
export type {
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
  ConstConstraintNode,
  CustomConstraintNode,
  AnnotationNode,
  DisplayNameAnnotationNode,
  DescriptionAnnotationNode,
  RemarksAnnotationNode,
  FormatAnnotationNode,
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
} from "./ir.js";
