/**
 * Canonical Intermediate Representation (IR) types for FormSpec.
 *
 * The IR is the shared intermediate structure that both authoring surfaces
 * (chain DSL and TSDoc-annotated types) compile to. All downstream operations
 * — JSON Schema generation, UI Schema generation, constraint validation,
 * diagnostics — consume the IR exclusively.
 *
 * All types are plain, serializable objects (no live compiler references).
 *
 * @see {@link https://github.com/stripe/formspec-workspace/blob/main/scratch/design/001-canonical-ir.md}
 */

import type { ResolvedMetadata } from "./metadata.js";

// =============================================================================
// IR VERSION
// =============================================================================

/**
 * The current IR format version. Centralized here so all canonicalizers
 * and consumers reference a single source of truth.
 *
 * @beta
 */
export const IR_VERSION = "0.1.0" as const;

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * A JSON-serializable value. All IR nodes must be representable as JSON.
 *
 * @beta
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

// =============================================================================
// PROVENANCE
// =============================================================================

/**
 * Describes the origin of an IR node.
 * Enables diagnostics that point to the source of a contradiction or error.
 *
 * @beta
 */
export interface Provenance {
  /** The authoring surface that produced this node. */
  readonly surface: "tsdoc" | "chain-dsl" | "extension" | "inferred";
  /** Absolute path to the source file. */
  readonly file: string;
  /** 1-based line number in the source file. */
  readonly line: number;
  /** 0-based column number in the source file. */
  readonly column: number;
  /** Length of the source span in characters (for IDE underline ranges). */
  readonly length?: number;
  /**
   * The specific tag, call, or construct that produced this node.
   * Examples: `@minimum`, `field.number({ min: 0 })`, `optional`
   */
  readonly tagName?: string;
}

// =============================================================================
// PATH TARGET
// =============================================================================

/**
 * A path targeting a sub-field within a complex type.
 * Used by constraints and annotations to target nested properties.
 *
 * @beta
 */
export interface PathTarget {
  /**
   * Sequence of property names forming a path from the annotated field's type
   * to the target sub-field.
   * e.g., `["value"]` or `["address", "zip"]`
   */
  readonly segments: readonly string[];
}

// =============================================================================
// TYPE NODES
// =============================================================================

/**
 * Discriminated union of all type representations in the IR.
 *
 * @beta
 */
export type TypeNode =
  | PrimitiveTypeNode
  | EnumTypeNode
  | ArrayTypeNode
  | ObjectTypeNode
  | RecordTypeNode
  | UnionTypeNode
  | ReferenceTypeNode
  | DynamicTypeNode
  | CustomTypeNode;

/**
 * Primitive types mapping directly to JSON Schema primitives.
 *
 * Note: integer is NOT a primitive kind — integer semantics are expressed
 * via a `multipleOf: 1` constraint on a number type.
 *
 * @beta
 */
export interface PrimitiveTypeNode {
  /** Discriminator identifying this node as a primitive type. */
  readonly kind: "primitive";
  /** Primitive value family represented by this node. */
  readonly primitiveKind: "string" | "number" | "integer" | "bigint" | "boolean" | "null";
}

/**
 * A member of a static enum type.
 *
 * @beta
 */
export interface EnumMember {
  /** The serialized value stored in data. */
  readonly value: string | number;
  /** Optional per-member display name. */
  readonly displayName?: string;
}

/**
 * Static enum type with members known at build time.
 *
 * @beta
 */
export interface EnumTypeNode {
  /** Discriminator identifying this node as an enum type. */
  readonly kind: "enum";
  /** Allowed enum members in declaration order. */
  readonly members: readonly EnumMember[];
}

/**
 * Array type with a single items type.
 *
 * @beta
 */
export interface ArrayTypeNode {
  /** Discriminator identifying this node as an array type. */
  readonly kind: "array";
  /** Item type for each array entry. */
  readonly items: TypeNode;
}

/**
 * A named property within an object type.
 *
 * @beta
 */
export interface ObjectProperty {
  /** Property name as it appears in the containing object type. */
  readonly name: string;
  /** Resolved metadata associated with the logical property. */
  readonly metadata?: ResolvedMetadata;
  /** Canonical IR type for this property. */
  readonly type: TypeNode;
  /** Whether the property may be omitted from object values. */
  readonly optional: boolean;
  /**
   * Use-site constraints on this property.
   * Distinct from constraints on the property's type — these are
   * use-site constraints (e.g., `@minimum :amount 0` targets the
   * `amount` property of a `MonetaryAmount` field).
   */
  readonly constraints: readonly ConstraintNode[];
  /** Use-site annotations on this property. */
  readonly annotations: readonly AnnotationNode[];
  /** Source location that produced this property entry. */
  readonly provenance: Provenance;
}

/**
 * Object type with named properties.
 *
 * @beta
 */
export interface ObjectTypeNode {
  /** Discriminator identifying this node as an object type. */
  readonly kind: "object";
  /**
   * Named properties of this object. Order is preserved from the source
   * declaration for deterministic output.
   */
  readonly properties: readonly ObjectProperty[];
  /**
   * Whether additional properties beyond those listed are permitted.
   * Ordinary static object types default to true under the current spec.
   * Explicitly closed-object modes may still set this to false.
   */
  readonly additionalProperties: boolean;
}

/**
 * Record (dictionary) type — an object with a string index signature and no
 * named properties. Corresponds to `Record<string, T>` or `{ [k: string]: T }`.
 *
 * Emitted as `{ "type": "object", "additionalProperties": <value schema> }` in
 * JSON Schema per spec 003 §2.5.
 *
 * @beta
 */
export interface RecordTypeNode {
  /** Discriminator identifying this node as a record type. */
  readonly kind: "record";
  /** The type of each value in the dictionary. */
  readonly valueType: TypeNode;
}

/**
 * Union type for non-enum unions. Nullable types are represented as `T | null`.
 *
 * @beta
 */
export interface UnionTypeNode {
  /** Discriminator identifying this node as a union type. */
  readonly kind: "union";
  /** Member types that participate in the union. */
  readonly members: readonly TypeNode[];
}

/**
 * Named type reference preserved for `$defs` and `$ref` emission.
 *
 * @beta
 */
export interface ReferenceTypeNode {
  /** Discriminator identifying this node as a named reference type. */
  readonly kind: "reference";
  /**
   * The fully-qualified name of the referenced type.
   * For TypeScript interfaces/type aliases: `"<module>#<TypeName>"`.
   * For built-in types: the primitive kind string.
   */
  readonly name: string;
  /**
   * Type arguments if this is a generic instantiation.
   * e.g., `Array<string>` → `{ name: "Array", typeArguments: [PrimitiveTypeNode("string")] }`
   */
  readonly typeArguments: readonly TypeNode[];
}

/**
 * Dynamic type whose schema is resolved at runtime from a named data source.
 *
 * @beta
 */
export interface DynamicTypeNode {
  /** Discriminator identifying this node as a runtime-resolved type. */
  readonly kind: "dynamic";
  /** Dynamic schema family resolved for this field. */
  readonly dynamicKind: "enum" | "schema";
  /** Key identifying the runtime data source or schema provider. */
  readonly sourceKey: string;
  /**
   * For dynamic enums: field names whose current values are passed as
   * parameters to the data source resolver.
   */
  readonly parameterFields: readonly string[];
}

/**
 * Custom type registered by an extension.
 *
 * @beta
 */
export interface CustomTypeNode {
  /** Discriminator identifying this node as an extension-provided type. */
  readonly kind: "custom";
  /**
   * The extension-qualified type identifier.
   * Format: `"<vendor-prefix>/<extension-name>/<type-name>"`
   * e.g., `"x-stripe/monetary/MonetaryAmount"`
   */
  readonly typeId: string;
  /**
   * Opaque payload serialized by the extension that registered this type.
   * Must be JSON-serializable.
   */
  readonly payload: JsonValue;
}

// =============================================================================
// CONSTRAINT NODES
// =============================================================================

/**
 * Discriminated union of all constraint types.
 * Constraints are set-influencing: they narrow the set of valid values.
 *
 * @beta
 */
export type ConstraintNode =
  | NumericConstraintNode
  | LengthConstraintNode
  | PatternConstraintNode
  | ArrayCardinalityConstraintNode
  | EnumMemberConstraintNode
  | ConstConstraintNode
  | CustomConstraintNode;

/**
 * Numeric constraints: bounds and multipleOf.
 *
 * `minimum` and `maximum` are inclusive; `exclusiveMinimum` and
 * `exclusiveMaximum` are exclusive bounds (matching JSON Schema 2020-12
 * semantics).
 *
 * Type applicability: may only attach to fields with `PrimitiveTypeNode("number")`
 * or a `ReferenceTypeNode` that resolves to one.
 *
 * @beta
 */
export interface NumericConstraintNode {
  /** Discriminator identifying this node as a constraint. */
  readonly kind: "constraint";
  /** Specific numeric constraint represented by this node. */
  readonly constraintKind:
    | "minimum"
    | "maximum"
    | "exclusiveMinimum"
    | "exclusiveMaximum"
    | "multipleOf";
  /** Numeric value carried by the constraint. */
  readonly value: number;
  /** If present, targets a nested sub-field rather than the field itself. */
  readonly path?: PathTarget;
  /** Source location that produced this constraint. */
  readonly provenance: Provenance;
}

/**
 * String length and array item count constraints.
 *
 * `minLength`/`maxLength` apply to strings; `minItems`/`maxItems` apply to
 * arrays. They share the same node shape because the composition rules are
 * identical.
 *
 * Type applicability: `minLength`/`maxLength` require `PrimitiveTypeNode("string")`;
 * `minItems`/`maxItems` require `ArrayTypeNode`.
 *
 * @beta
 */
export interface LengthConstraintNode {
  /** Discriminator identifying this node as a constraint. */
  readonly kind: "constraint";
  /** Specific length or cardinality constraint represented by this node. */
  readonly constraintKind: "minLength" | "maxLength" | "minItems" | "maxItems";
  /** Inclusive bound value carried by the constraint. */
  readonly value: number;
  /** Nested path target, when the constraint applies below the field root. */
  readonly path?: PathTarget;
  /** Source location that produced this constraint. */
  readonly provenance: Provenance;
}

/**
 * String pattern constraint (ECMA-262 regex without delimiters).
 *
 * Multiple `pattern` constraints on the same field compose via intersection:
 * all patterns must match simultaneously.
 *
 * Type applicability: requires `PrimitiveTypeNode("string")`.
 *
 * @beta
 */
export interface PatternConstraintNode {
  /** Discriminator identifying this node as a constraint. */
  readonly kind: "constraint";
  /** Specific pattern constraint represented by this node. */
  readonly constraintKind: "pattern";
  /** ECMA-262 regular expression, without delimiters. */
  readonly pattern: string;
  /** Nested path target, when the constraint applies below the field root. */
  readonly path?: PathTarget;
  /** Source location that produced this constraint. */
  readonly provenance: Provenance;
}

/**
 * Array uniqueness constraint.
 *
 * @beta
 */
export interface ArrayCardinalityConstraintNode {
  /** Discriminator identifying this node as a constraint. */
  readonly kind: "constraint";
  /** Specific array-cardinality constraint represented by this node. */
  readonly constraintKind: "uniqueItems";
  /** Marker value used for boolean-style array uniqueness constraints. */
  readonly value: true;
  /** Nested path target, when the constraint applies below the field root. */
  readonly path?: PathTarget;
  /** Source location that produced this constraint. */
  readonly provenance: Provenance;
}

/**
 * Enum member subset constraint that only narrows the allowed member set.
 *
 * @beta
 */
export interface EnumMemberConstraintNode {
  /** Discriminator identifying this node as a constraint. */
  readonly kind: "constraint";
  /** Specific enum-membership constraint represented by this node. */
  readonly constraintKind: "allowedMembers";
  /** Subset of enum member values that remain valid. */
  readonly members: readonly (string | number)[];
  /** Nested path target, when the constraint applies below the field root. */
  readonly path?: PathTarget;
  /** Source location that produced this constraint. */
  readonly provenance: Provenance;
}

/**
 * Literal-value equality constraint.
 *
 * @beta
 */
export interface ConstConstraintNode {
  /** Discriminator identifying this node as a constraint. */
  readonly kind: "constraint";
  /** Specific literal-equality constraint represented by this node. */
  readonly constraintKind: "const";
  /** JSON-serializable literal value the field must equal. */
  readonly value: JsonValue;
  /** Nested path target, when the constraint applies below the field root. */
  readonly path?: PathTarget;
  /** Source location that produced this constraint. */
  readonly provenance: Provenance;
}

/**
 * Extension-registered custom constraint.
 *
 * @beta
 */
export interface CustomConstraintNode {
  /** Discriminator identifying this node as a constraint. */
  readonly kind: "constraint";
  /** Specific custom-constraint marker used for extension nodes. */
  readonly constraintKind: "custom";
  /** Extension-qualified ID: `"<vendor-prefix>/<extension-name>/<constraint-name>"` */
  readonly constraintId: string;
  /** JSON-serializable payload defined by the extension. */
  readonly payload: JsonValue;
  /** How this constraint composes with others of the same `constraintId`. */
  readonly compositionRule: "intersect" | "override";
  /** Nested path target, when the constraint applies below the field root. */
  readonly path?: PathTarget;
  /** Source location that produced this constraint. */
  readonly provenance: Provenance;
}

// =============================================================================
// ANNOTATION NODES
// =============================================================================

/**
 * Discriminated union of all annotation types.
 * Annotations are value-influencing: they describe or present a field
 * but do not affect which values are valid.
 *
 * @beta
 */
export type AnnotationNode =
  | DisplayNameAnnotationNode
  | DescriptionAnnotationNode
  | RemarksAnnotationNode
  | FormatAnnotationNode
  | PlaceholderAnnotationNode
  | DefaultValueAnnotationNode
  | DeprecatedAnnotationNode
  | FormatHintAnnotationNode
  | CustomAnnotationNode;

/**
 * Display-name annotation.
 *
 * @beta
 */
export interface DisplayNameAnnotationNode {
  /** Discriminator identifying this node as an annotation. */
  readonly kind: "annotation";
  /** Specific annotation kind represented by this node. */
  readonly annotationKind: "displayName";
  /** Human-readable display label for the field or type. */
  readonly value: string;
  /** Source location that produced this annotation. */
  readonly provenance: Provenance;
}

/**
 * Description annotation.
 *
 * @beta
 */
export interface DescriptionAnnotationNode {
  /** Discriminator identifying this node as an annotation. */
  readonly kind: "annotation";
  /** Specific annotation kind represented by this node. */
  readonly annotationKind: "description";
  /** Description text surfaced in generated schemas and tooling. */
  readonly value: string;
  /** Source location that produced this annotation. */
  readonly provenance: Provenance;
}

/**
 * Remarks annotation — programmatic-persona documentation carried via
 * the `x-<vendor>-remarks` JSON Schema extension keyword.
 *
 * Populated from `@remarks` TSDoc tag content. SDK codegen can include
 * this in doc comments; API Documenter renders the source `@remarks`
 * natively in a dedicated Remarks section.
 *
 * @beta
 */
export interface RemarksAnnotationNode {
  /** Discriminator identifying this node as an annotation. */
  readonly kind: "annotation";
  /** Specific annotation kind represented by this node. */
  readonly annotationKind: "remarks";
  /** Long-form remarks content carried through canonicalization. */
  readonly value: string;
  /** Source location that produced this annotation. */
  readonly provenance: Provenance;
}

/**
 * Schema format annotation, for example `email`, `date`, or `uri`.
 *
 * @beta
 */
export interface FormatAnnotationNode {
  /** Discriminator identifying this node as an annotation. */
  readonly kind: "annotation";
  /** Specific annotation kind represented by this node. */
  readonly annotationKind: "format";
  /** Schema format keyword value to emit downstream. */
  readonly value: string;
  /** Source location that produced this annotation. */
  readonly provenance: Provenance;
}

/**
 * Placeholder annotation.
 *
 * @beta
 */
export interface PlaceholderAnnotationNode {
  /** Discriminator identifying this node as an annotation. */
  readonly kind: "annotation";
  /** Specific annotation kind represented by this node. */
  readonly annotationKind: "placeholder";
  /** Placeholder text intended for UI renderers. */
  readonly value: string;
  /** Source location that produced this annotation. */
  readonly provenance: Provenance;
}

/**
 * Default-value annotation.
 *
 * @beta
 */
export interface DefaultValueAnnotationNode {
  /** Discriminator identifying this node as an annotation. */
  readonly kind: "annotation";
  /** Specific annotation kind represented by this node. */
  readonly annotationKind: "defaultValue";
  /** Must be JSON-serializable and type-compatible (verified during Validate phase). */
  readonly value: JsonValue;
  /** Source location that produced this annotation. */
  readonly provenance: Provenance;
}

/**
 * Deprecated annotation.
 *
 * @beta
 */
export interface DeprecatedAnnotationNode {
  /** Discriminator identifying this node as an annotation. */
  readonly kind: "annotation";
  /** Specific annotation kind represented by this node. */
  readonly annotationKind: "deprecated";
  /** Optional deprecation message. */
  readonly message?: string;
  /** Source location that produced this annotation. */
  readonly provenance: Provenance;
}

/**
 * UI rendering hint — does not affect schema validation.
 * Unlike FormatAnnotationNode, this never emits a JSON Schema `format`.
 *
 * @beta
 */
export interface FormatHintAnnotationNode {
  /** Discriminator identifying this node as an annotation. */
  readonly kind: "annotation";
  /** Specific annotation kind represented by this node. */
  readonly annotationKind: "formatHint";
  /** Renderer-specific format identifier: "textarea", "radio", "date", "color", etc. */
  readonly format: string;
  /** Source location that produced this annotation. */
  readonly provenance: Provenance;
}

/**
 * Extension-registered custom annotation.
 *
 * @beta
 */
export interface CustomAnnotationNode {
  /** Discriminator identifying this node as an annotation. */
  readonly kind: "annotation";
  /** Specific annotation kind represented by this node. */
  readonly annotationKind: "custom";
  /** Extension-qualified ID: `"<vendor-prefix>/<extension-name>/<annotation-name>"` */
  readonly annotationId: string;
  /** JSON-serializable extension payload carried by this annotation. */
  readonly value: JsonValue;
  /** Source location that produced this annotation. */
  readonly provenance: Provenance;
}

// =============================================================================
// FIELD NODE
// =============================================================================

/**
 * A single form field after canonicalization.
 *
 * @beta
 */
export interface FieldNode {
  /** Discriminator identifying this node as a field. */
  readonly kind: "field";
  /** The field's key in the data schema. */
  readonly name: string;
  /** Resolved metadata associated with the logical field. */
  readonly metadata?: ResolvedMetadata;
  /** The resolved type of this field. */
  readonly type: TypeNode;
  /** Whether this field is required in the data schema. */
  readonly required: boolean;
  /** Set-influencing constraints, after merging. */
  readonly constraints: readonly ConstraintNode[];
  /** Value-influencing annotations, after merging. */
  readonly annotations: readonly AnnotationNode[];
  /** Where this field was declared. */
  readonly provenance: Provenance;
  /**
   * Debug only — ordered list of constraint/annotation nodes that participated
   * in merging, including dominated ones.
   */
  readonly mergeHistory?: readonly {
    readonly node: ConstraintNode | AnnotationNode;
    readonly dominated: boolean;
  }[];
}

// =============================================================================
// LAYOUT NODES
// =============================================================================

/**
 * Union of layout node types.
 *
 * @beta
 */
export type LayoutNode = GroupLayoutNode | ConditionalLayoutNode;

/**
 * A visual grouping of form elements.
 *
 * @beta
 */
export interface GroupLayoutNode {
  /** Discriminator identifying this node as a group layout. */
  readonly kind: "group";
  /** Display label associated with the visual group. */
  readonly label: string;
  /** Elements contained in this group — may be fields or nested groups. */
  readonly elements: readonly FormIRElement[];
  /** Source location that produced this layout node. */
  readonly provenance: Provenance;
}

/**
 * Conditional visibility based on another field's value.
 *
 * @beta
 */
export interface ConditionalLayoutNode {
  /** Discriminator identifying this node as a conditional layout. */
  readonly kind: "conditional";
  /** The field whose value triggers visibility. */
  readonly fieldName: string;
  /** The value that makes the condition true (SHOW). */
  readonly value: JsonValue;
  /** Elements shown when the condition is met. */
  readonly elements: readonly FormIRElement[];
  /** Source location that produced this layout node. */
  readonly provenance: Provenance;
}

/**
 * Union of all IR element types.
 *
 * @beta
 */
export type FormIRElement = FieldNode | LayoutNode;

// =============================================================================
// TYPE REGISTRY
// =============================================================================

/**
 * A named type definition stored in the type registry.
 *
 * @beta
 */
export interface TypeDefinition {
  /** The fully-qualified reference name (key in the registry). */
  readonly name: string;
  /** Resolved metadata associated with the logical named type. */
  readonly metadata?: ResolvedMetadata;
  /** The resolved type node. */
  readonly type: TypeNode;
  /** Constraints declared on the named type itself. */
  readonly constraints?: readonly ConstraintNode[];
  /** Root-level value metadata for a named type definition. */
  readonly annotations?: readonly AnnotationNode[];
  /** Where this type was declared. */
  readonly provenance: Provenance;
}

// =============================================================================
// FORM IR (TOP-LEVEL)
// =============================================================================

/**
 * The complete Canonical Intermediate Representation for a form.
 *
 * Output of the Canonicalize phase; input to Validate, Generate (JSON Schema),
 * and Generate (UI Schema) phases.
 *
 * Serializable to JSON — no live compiler objects.
 *
 * @beta
 */
export interface FormIR {
  /** Discriminator identifying this document as a top-level FormIR payload. */
  readonly kind: "form-ir";
  /** Logical name of the analyzed root declaration, when one exists. */
  readonly name?: string;
  /**
   * Schema version for the IR format itself.
   * Should equal `IR_VERSION`.
   */
  readonly irVersion: string;
  /** Top-level elements of the form: fields and layout nodes. */
  readonly elements: readonly FormIRElement[];
  /** Resolved metadata associated with the logical form/type root. */
  readonly metadata?: ResolvedMetadata;
  /** Root-level annotations derived from the source declaration itself. */
  readonly rootAnnotations?: readonly AnnotationNode[];
  /**
   * Registry of named types referenced by fields in this form.
   * Keys are fully-qualified type names matching `ReferenceTypeNode.name`.
   */
  readonly typeRegistry: Readonly<Record<string, TypeDefinition>>;
  /** Root-level metadata for the form itself. */
  readonly annotations?: readonly AnnotationNode[];
  /** Provenance of the form definition itself. */
  readonly provenance: Provenance;
}
