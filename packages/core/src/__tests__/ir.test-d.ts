/**
 * Type-level tests for the Canonical IR types.
 *
 * Verifies structural correctness of the IR type definitions at compile time.
 * Run with: pnpm --filter @formspec/core run test:types
 *
 * @see {@link https://github.com/stripe/formspec-workspace/blob/main/scratch/design/001-canonical-ir.md}
 */

import { expectType, expectNotType, expectAssignable, expectError } from "tsd";
import { IR_VERSION } from "../index.js";
import type {
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
} from "../index.js";

// =============================================================================
// IR_VERSION constant
// =============================================================================

expectType<"0.1.0">(IR_VERSION);
expectNotType<"1.0.0">(IR_VERSION);
expectNotType<string>(IR_VERSION);

// =============================================================================
// JsonValue
// =============================================================================

// Primitives are assignable to JsonValue
expectAssignable<JsonValue>(null);
expectAssignable<JsonValue>(true);
expectAssignable<JsonValue>(42);
expectAssignable<JsonValue>("hello");

// Arrays and objects are assignable
expectAssignable<JsonValue>(["a", 1, null]);
expectAssignable<JsonValue>({ key: "value" });
expectAssignable<JsonValue>({ nested: { count: 1 } });

// Non-serializable types are not assignable
expectError<JsonValue>(undefined);
// eslint-disable-next-line @typescript-eslint/no-empty-function -- testing that functions are rejected as JsonValue
expectError<JsonValue>(() => {});
expectError<JsonValue>(Symbol("x"));

// =============================================================================
// Provenance
// =============================================================================

const baseProvenance: Provenance = {
  surface: "chain-dsl",
  file: "/path/to/form.ts",
  line: 10,
  column: 0,
};

expectAssignable<Provenance>(baseProvenance);

// All valid surface values
expectAssignable<Provenance>({ ...baseProvenance, surface: "tsdoc" });
expectAssignable<Provenance>({ ...baseProvenance, surface: "chain-dsl" });
expectAssignable<Provenance>({ ...baseProvenance, surface: "extension" });
expectAssignable<Provenance>({ ...baseProvenance, surface: "inferred" });

// Optional fields
expectAssignable<Provenance>({ ...baseProvenance, length: 5 });
expectAssignable<Provenance>({ ...baseProvenance, tagName: "@minimum" });
expectAssignable<Provenance>({ ...baseProvenance, length: 5, tagName: "@minimum" });

// Invalid surface is an error
expectError<Provenance>({ ...baseProvenance, surface: "unknown-surface" });

// =============================================================================
// PathTarget
// =============================================================================

const pathTarget: PathTarget = { segments: ["address", "zip"] };
expectAssignable<PathTarget>(pathTarget);
expectAssignable<PathTarget>({ segments: [] });
expectAssignable<PathTarget>({ segments: ["value"] });

// =============================================================================
// TypeNode discriminated union
// =============================================================================

// PrimitiveTypeNode
const stringNode: PrimitiveTypeNode = { kind: "primitive", primitiveKind: "string" };
const numberNode: PrimitiveTypeNode = { kind: "primitive", primitiveKind: "number" };
const boolNode: PrimitiveTypeNode = { kind: "primitive", primitiveKind: "boolean" };
const nullNode: PrimitiveTypeNode = { kind: "primitive", primitiveKind: "null" };

expectAssignable<TypeNode>(stringNode);
expectAssignable<TypeNode>(numberNode);
expectAssignable<TypeNode>(boolNode);
expectAssignable<TypeNode>(nullNode);

// "integer" is NOT a valid primitiveKind (integers use multipleOf: 1 on number)
expectError<PrimitiveTypeNode>({ kind: "primitive", primitiveKind: "integer" });

// EnumTypeNode
const enumNode: EnumTypeNode = {
  kind: "enum",
  members: [{ value: "draft" }, { value: "sent", displayName: "Sent" }, { value: 1 }],
};
expectAssignable<TypeNode>(enumNode);

const enumMember: EnumMember = { value: "active" };
expectAssignable<EnumMember>(enumMember);
expectAssignable<EnumMember>({ value: 42 });
expectAssignable<EnumMember>({ value: "active", displayName: "Active" });

// ArrayTypeNode
const arrayNode: ArrayTypeNode = { kind: "array", items: stringNode };
expectAssignable<TypeNode>(arrayNode);

// Nested array
const nestedArray: ArrayTypeNode = { kind: "array", items: arrayNode };
expectAssignable<TypeNode>(nestedArray);

// ObjectTypeNode
const objectProp: ObjectProperty = {
  name: "street",
  type: stringNode,
  optional: false,
  constraints: [],
  annotations: [],
  provenance: baseProvenance,
};

const objectNode: ObjectTypeNode = {
  kind: "object",
  properties: [objectProp],
  additionalProperties: false,
};
expectAssignable<TypeNode>(objectNode);

// UnionTypeNode (e.g., nullable type T | null)
const unionNode: UnionTypeNode = {
  kind: "union",
  members: [stringNode, nullNode],
};
expectAssignable<TypeNode>(unionNode);

// ReferenceTypeNode
const refNode: ReferenceTypeNode = {
  kind: "reference",
  name: "my-module#Address",
  typeArguments: [],
};
expectAssignable<TypeNode>(refNode);

// Generic reference
const genericRef: ReferenceTypeNode = {
  kind: "reference",
  name: "Array",
  typeArguments: [stringNode],
};
expectAssignable<TypeNode>(genericRef);

// DynamicTypeNode
const dynEnumNode: DynamicTypeNode = {
  kind: "dynamic",
  dynamicKind: "enum",
  sourceKey: "countries",
  parameterFields: ["region"],
};
expectAssignable<TypeNode>(dynEnumNode);

const dynSchemaNode: DynamicTypeNode = {
  kind: "dynamic",
  dynamicKind: "schema",
  sourceKey: "productSchema",
  parameterFields: [],
};
expectAssignable<TypeNode>(dynSchemaNode);

// CustomTypeNode
const customTypeNode: CustomTypeNode = {
  kind: "custom",
  typeId: "x-stripe/monetary/MonetaryAmount",
  payload: { currency: "usd" },
};
expectAssignable<TypeNode>(customTypeNode);

// =============================================================================
// ConstraintNode discriminated union
// =============================================================================

// All constraint nodes share kind: "constraint"
const provNode = baseProvenance;

// NumericConstraintNode
const minConstraint: NumericConstraintNode = {
  kind: "constraint",
  constraintKind: "minimum",
  value: 0,
  provenance: provNode,
};
expectAssignable<ConstraintNode>(minConstraint);

const maxConstraint: NumericConstraintNode = {
  kind: "constraint",
  constraintKind: "maximum",
  value: 100,
  provenance: provNode,
};
expectAssignable<ConstraintNode>(maxConstraint);

const multipleOfConstraint: NumericConstraintNode = {
  kind: "constraint",
  constraintKind: "multipleOf",
  value: 1,
  provenance: provNode,
};
expectAssignable<ConstraintNode>(multipleOfConstraint);

// NumericConstraintNode with optional path
const minWithPath: NumericConstraintNode = {
  kind: "constraint",
  constraintKind: "minimum",
  value: 0,
  path: { segments: ["amount"] },
  provenance: provNode,
};
expectAssignable<ConstraintNode>(minWithPath);

// LengthConstraintNode
const minLengthConstraint: LengthConstraintNode = {
  kind: "constraint",
  constraintKind: "minLength",
  value: 1,
  provenance: provNode,
};
expectAssignable<ConstraintNode>(minLengthConstraint);

const minItemsConstraint: LengthConstraintNode = {
  kind: "constraint",
  constraintKind: "minItems",
  value: 1,
  provenance: provNode,
};
expectAssignable<ConstraintNode>(minItemsConstraint);

// PatternConstraintNode
const patternConstraint: PatternConstraintNode = {
  kind: "constraint",
  constraintKind: "pattern",
  pattern: "^[A-Z]{2}$",
  provenance: provNode,
};
expectAssignable<ConstraintNode>(patternConstraint);

// ArrayCardinalityConstraintNode — value must be literal true
const uniqueItemsConstraint: ArrayCardinalityConstraintNode = {
  kind: "constraint",
  constraintKind: "uniqueItems",
  value: true,
  provenance: provNode,
};
expectAssignable<ConstraintNode>(uniqueItemsConstraint);

// uniqueItems value must be true, not false
expectError<ArrayCardinalityConstraintNode>({
  kind: "constraint",
  constraintKind: "uniqueItems",
  value: false,
  provenance: provNode,
});

// EnumMemberConstraintNode
const allowedMembersConstraint: EnumMemberConstraintNode = {
  kind: "constraint",
  constraintKind: "allowedMembers",
  members: ["draft", "sent"],
  provenance: provNode,
};
expectAssignable<ConstraintNode>(allowedMembersConstraint);

const constConstraint: ConstConstraintNode = {
  kind: "constraint",
  constraintKind: "const",
  value: "USD",
  provenance: provNode,
};
expectAssignable<ConstraintNode>(constConstraint);

// Mixed string/number members
const mixedMembersConstraint: EnumMemberConstraintNode = {
  kind: "constraint",
  constraintKind: "allowedMembers",
  members: ["active", 1, "inactive"],
  provenance: provNode,
};
expectAssignable<ConstraintNode>(mixedMembersConstraint);

// CustomConstraintNode
const customConstraint: CustomConstraintNode = {
  kind: "constraint",
  constraintKind: "custom",
  constraintId: "x-stripe/payments/currency-code",
  payload: { allowedCurrencies: ["usd", "eur"] },
  compositionRule: "intersect",
  provenance: provNode,
};
expectAssignable<ConstraintNode>(customConstraint);

const customOverrideConstraint: CustomConstraintNode = {
  kind: "constraint",
  constraintKind: "custom",
  constraintId: "x-stripe/payments/currency-code",
  payload: null,
  compositionRule: "override",
  provenance: provNode,
};
expectAssignable<ConstraintNode>(customOverrideConstraint);

// compositionRule must be "intersect" or "override"
expectError<CustomConstraintNode>({
  kind: "constraint",
  constraintKind: "custom",
  constraintId: "x-example/pkg/rule",
  payload: null,
  compositionRule: "merge",
  provenance: provNode,
});

// =============================================================================
// AnnotationNode discriminated union
// =============================================================================

// All annotation nodes share kind: "annotation"

const displayNameAnnotation: DisplayNameAnnotationNode = {
  kind: "annotation",
  annotationKind: "displayName",
  value: "Email Address",
  provenance: provNode,
};
expectAssignable<AnnotationNode>(displayNameAnnotation);

const descriptionAnnotation: DescriptionAnnotationNode = {
  kind: "annotation",
  annotationKind: "description",
  value: "The user's email address",
  provenance: provNode,
};
expectAssignable<AnnotationNode>(descriptionAnnotation);

const formatAnnotation: FormatAnnotationNode = {
  kind: "annotation",
  annotationKind: "format",
  value: "email",
  provenance: provNode,
};
expectAssignable<AnnotationNode>(formatAnnotation);

const placeholderAnnotation: PlaceholderAnnotationNode = {
  kind: "annotation",
  annotationKind: "placeholder",
  value: "you@example.com",
  provenance: provNode,
};
expectAssignable<AnnotationNode>(placeholderAnnotation);

const defaultValueAnnotation: DefaultValueAnnotationNode = {
  kind: "annotation",
  annotationKind: "defaultValue",
  value: "draft",
  provenance: provNode,
};
expectAssignable<AnnotationNode>(defaultValueAnnotation);

// defaultValue accepts any JsonValue
const defaultValueNull: DefaultValueAnnotationNode = {
  kind: "annotation",
  annotationKind: "defaultValue",
  value: null,
  provenance: provNode,
};
expectAssignable<AnnotationNode>(defaultValueNull);

const defaultValueObj: DefaultValueAnnotationNode = {
  kind: "annotation",
  annotationKind: "defaultValue",
  value: { amount: 0, currency: "usd" },
  provenance: provNode,
};
expectAssignable<AnnotationNode>(defaultValueObj);

const deprecatedAnnotation: DeprecatedAnnotationNode = {
  kind: "annotation",
  annotationKind: "deprecated",
  provenance: provNode,
};
expectAssignable<AnnotationNode>(deprecatedAnnotation);

// deprecated with optional message
const deprecatedWithMessage: DeprecatedAnnotationNode = {
  kind: "annotation",
  annotationKind: "deprecated",
  message: "Use newField instead",
  provenance: provNode,
};
expectAssignable<AnnotationNode>(deprecatedWithMessage);

const formatHintAnnotation: FormatHintAnnotationNode = {
  kind: "annotation",
  annotationKind: "formatHint",
  format: "textarea",
  provenance: provNode,
};
expectAssignable<AnnotationNode>(formatHintAnnotation);

const customAnnotation: CustomAnnotationNode = {
  kind: "annotation",
  annotationKind: "custom",
  annotationId: "x-stripe/ui/masked-input",
  value: { maskChar: "*" },
  provenance: provNode,
};
expectAssignable<AnnotationNode>(customAnnotation);

// =============================================================================
// FieldNode
// =============================================================================

const fieldNode: FieldNode = {
  kind: "field",
  name: "email",
  type: stringNode,
  required: true,
  constraints: [minLengthConstraint],
  annotations: [displayNameAnnotation],
  provenance: provNode,
};
expectAssignable<FormIRElement>(fieldNode);

// Optional mergeHistory
const fieldWithHistory: FieldNode = {
  ...fieldNode,
  mergeHistory: [
    { node: minLengthConstraint, dominated: false },
    { node: displayNameAnnotation, dominated: true },
  ],
};
expectAssignable<FieldNode>(fieldWithHistory);

// =============================================================================
// LayoutNode: GroupLayoutNode and ConditionalLayoutNode
// =============================================================================

const groupNode: GroupLayoutNode = {
  kind: "group",
  label: "Personal Information",
  elements: [fieldNode],
  provenance: provNode,
};
expectAssignable<LayoutNode>(groupNode);
expectAssignable<FormIRElement>(groupNode);

// Nested groups
const nestedGroup: GroupLayoutNode = {
  kind: "group",
  label: "Outer",
  elements: [groupNode, fieldNode],
  provenance: provNode,
};
expectAssignable<GroupLayoutNode>(nestedGroup);

const conditionalNode: ConditionalLayoutNode = {
  kind: "conditional",
  fieldName: "accountType",
  value: "business",
  elements: [fieldNode],
  provenance: provNode,
};
expectAssignable<LayoutNode>(conditionalNode);
expectAssignable<FormIRElement>(conditionalNode);

// =============================================================================
// TypeDefinition
// =============================================================================

const typeDef: TypeDefinition = {
  name: "my-module#Address",
  type: objectNode,
  provenance: provNode,
};
expectAssignable<TypeDefinition>(typeDef);

// =============================================================================
// FormIR (top-level)
// =============================================================================

const formIR: FormIR = {
  kind: "form-ir",
  irVersion: "0.1.0",
  elements: [fieldNode, groupNode, conditionalNode],
  typeRegistry: {
    "my-module#Address": typeDef,
  },
  provenance: provNode,
};
expectAssignable<FormIR>(formIR);

// Empty form is valid
const emptyFormIR: FormIR = {
  kind: "form-ir",
  irVersion: "0.1.0",
  elements: [],
  typeRegistry: {},
  provenance: provNode,
};
expectAssignable<FormIR>(emptyFormIR);

// =============================================================================
// Negative tests — discriminant guards
// =============================================================================

// ConstraintNode must have kind: "constraint"
expectError<ConstraintNode>({
  kind: "annotation",
  constraintKind: "minimum",
  value: 0,
  provenance: provNode,
});

// AnnotationNode must have kind: "annotation"
expectError<AnnotationNode>({
  kind: "constraint",
  annotationKind: "displayName",
  value: "Name",
  provenance: provNode,
});

// FieldNode must have kind: "field"
expectError<FieldNode>({
  kind: "group",
  name: "email",
  type: stringNode,
  required: true,
  constraints: [],
  annotations: [],
  provenance: provNode,
});

// GroupLayoutNode must have kind: "group"
expectError<GroupLayoutNode>({
  kind: "field",
  label: "Group",
  elements: [],
  provenance: provNode,
});

// ConditionalLayoutNode must have kind: "conditional"
expectError<ConditionalLayoutNode>({
  kind: "group",
  fieldName: "type",
  value: "business",
  elements: [],
  provenance: provNode,
});

// FormIR must have kind: "form-ir"
expectError<FormIR>({
  kind: "field",
  irVersion: "0.1.0",
  elements: [],
  typeRegistry: {},
  provenance: provNode,
});

// =============================================================================
// MISSING CONSTRAINT VARIANT COVERAGE
// =============================================================================

const exclusiveMinConstraint: NumericConstraintNode = {
  kind: "constraint",
  constraintKind: "exclusiveMinimum",
  value: 0,
  provenance: provNode,
};
expectAssignable<ConstraintNode>(exclusiveMinConstraint);

const exclusiveMaxConstraint: NumericConstraintNode = {
  kind: "constraint",
  constraintKind: "exclusiveMaximum",
  value: 100,
  provenance: provNode,
};
expectAssignable<ConstraintNode>(exclusiveMaxConstraint);

const maxLengthConstraint: LengthConstraintNode = {
  kind: "constraint",
  constraintKind: "maxLength",
  value: 255,
  provenance: provNode,
};
expectAssignable<ConstraintNode>(maxLengthConstraint);

const maxItemsConstraint: LengthConstraintNode = {
  kind: "constraint",
  constraintKind: "maxItems",
  value: 50,
  provenance: provNode,
};
expectAssignable<ConstraintNode>(maxItemsConstraint);

// =============================================================================
// DISCRIMINATED UNION NARROWING TESTS
// =============================================================================

// TypeNode narrows on `kind`
declare const typeNodeVar: TypeNode;
if (typeNodeVar.kind === "primitive") {
  expectType<PrimitiveTypeNode>(typeNodeVar);
}
if (typeNodeVar.kind === "enum") {
  expectType<EnumTypeNode>(typeNodeVar);
}
if (typeNodeVar.kind === "array") {
  expectType<ArrayTypeNode>(typeNodeVar);
}
if (typeNodeVar.kind === "object") {
  expectType<ObjectTypeNode>(typeNodeVar);
}
if (typeNodeVar.kind === "union") {
  expectType<UnionTypeNode>(typeNodeVar);
}
if (typeNodeVar.kind === "reference") {
  expectType<ReferenceTypeNode>(typeNodeVar);
}
if (typeNodeVar.kind === "dynamic") {
  expectType<DynamicTypeNode>(typeNodeVar);
}
if (typeNodeVar.kind === "custom") {
  expectType<CustomTypeNode>(typeNodeVar);
}

// ConstraintNode narrows on `constraintKind`
declare const constraintVar: ConstraintNode;
if (constraintVar.constraintKind === "minimum") {
  expectType<NumericConstraintNode>(constraintVar);
}
if (constraintVar.constraintKind === "pattern") {
  expectType<PatternConstraintNode>(constraintVar);
}
if (constraintVar.constraintKind === "minLength") {
  expectType<LengthConstraintNode>(constraintVar);
}
if (constraintVar.constraintKind === "uniqueItems") {
  expectType<ArrayCardinalityConstraintNode>(constraintVar);
}
if (constraintVar.constraintKind === "allowedMembers") {
  expectType<EnumMemberConstraintNode>(constraintVar);
}
if (constraintVar.constraintKind === "custom") {
  expectType<CustomConstraintNode>(constraintVar);
}

// AnnotationNode narrows on `annotationKind`
declare const annotationVar: AnnotationNode;
if (annotationVar.annotationKind === "displayName") {
  expectType<DisplayNameAnnotationNode>(annotationVar);
}
if (annotationVar.annotationKind === "description") {
  expectType<DescriptionAnnotationNode>(annotationVar);
}
if (annotationVar.annotationKind === "format") {
  expectType<FormatAnnotationNode>(annotationVar);
}
if (annotationVar.annotationKind === "placeholder") {
  expectType<PlaceholderAnnotationNode>(annotationVar);
}
if (annotationVar.annotationKind === "defaultValue") {
  expectType<DefaultValueAnnotationNode>(annotationVar);
}
if (annotationVar.annotationKind === "deprecated") {
  expectType<DeprecatedAnnotationNode>(annotationVar);
}
if (annotationVar.annotationKind === "formatHint") {
  expectType<FormatHintAnnotationNode>(annotationVar);
}
if (annotationVar.annotationKind === "custom") {
  expectType<CustomAnnotationNode>(annotationVar);
}

// LayoutNode narrows on `kind`
declare const layoutVar: LayoutNode;
if (layoutVar.kind === "group") {
  expectType<GroupLayoutNode>(layoutVar);
}
if (layoutVar.kind === "conditional") {
  expectType<ConditionalLayoutNode>(layoutVar);
}

// FormIRElement narrows on `kind`
declare const elementVar: FormIRElement;
if (elementVar.kind === "field") {
  expectType<FieldNode>(elementVar);
}
if (elementVar.kind === "group") {
  expectType<GroupLayoutNode>(elementVar);
}
if (elementVar.kind === "conditional") {
  expectType<ConditionalLayoutNode>(elementVar);
}
