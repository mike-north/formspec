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

// =============================================================================
// IR VERSION
// =============================================================================

/**
 * The current IR format version. Centralized here so all canonicalizers
 * and consumers reference a single source of truth.
 */
export const IR_VERSION = "0.1.0" as const;

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * A JSON-serializable value. All IR nodes must be representable as JSON.
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
 */
export interface PrimitiveTypeNode {
  readonly kind: "primitive";
  readonly primitiveKind: "string" | "number" | "integer" | "bigint" | "boolean" | "null";
}

/** A member of a static enum type. */
export interface EnumMember {
  /** The serialized value stored in data. */
  readonly value: string | number;
  /** Optional per-member display name. */
  readonly displayName?: string;
}

/** Static enum type — members known at build time. */
export interface EnumTypeNode {
  readonly kind: "enum";
  readonly members: readonly EnumMember[];
}

/** Array type with a single items type. */
export interface ArrayTypeNode {
  readonly kind: "array";
  readonly items: TypeNode;
}

/** A named property within an object type. */
export interface ObjectProperty {
  readonly name: string;
  readonly type: TypeNode;
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
  readonly provenance: Provenance;
}

/** Object type with named properties. */
export interface ObjectTypeNode {
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
 */
export interface RecordTypeNode {
  readonly kind: "record";
  /** The type of each value in the dictionary. */
  readonly valueType: TypeNode;
}

/** Union type for non-enum unions. Nullable types are `T | null` using this. */
export interface UnionTypeNode {
  readonly kind: "union";
  readonly members: readonly TypeNode[];
}

/** Named type reference — preserved as references for `$defs`/`$ref` emission. */
export interface ReferenceTypeNode {
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

/** Dynamic type — schema resolved at runtime from a named data source. */
export interface DynamicTypeNode {
  readonly kind: "dynamic";
  readonly dynamicKind: "enum" | "schema";
  /** Key identifying the runtime data source or schema provider. */
  readonly sourceKey: string;
  /**
   * For dynamic enums: field names whose current values are passed as
   * parameters to the data source resolver.
   */
  readonly parameterFields: readonly string[];
}

/** Custom type registered by an extension. */
export interface CustomTypeNode {
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
 */
export interface NumericConstraintNode {
  readonly kind: "constraint";
  readonly constraintKind:
    | "minimum"
    | "maximum"
    | "exclusiveMinimum"
    | "exclusiveMaximum"
    | "multipleOf";
  readonly value: number;
  /** If present, targets a nested sub-field rather than the field itself. */
  readonly path?: PathTarget;
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
 */
export interface LengthConstraintNode {
  readonly kind: "constraint";
  readonly constraintKind: "minLength" | "maxLength" | "minItems" | "maxItems";
  readonly value: number;
  readonly path?: PathTarget;
  readonly provenance: Provenance;
}

/**
 * String pattern constraint (ECMA-262 regex without delimiters).
 *
 * Multiple `pattern` constraints on the same field compose via intersection:
 * all patterns must match simultaneously.
 *
 * Type applicability: requires `PrimitiveTypeNode("string")`.
 */
export interface PatternConstraintNode {
  readonly kind: "constraint";
  readonly constraintKind: "pattern";
  /** ECMA-262 regular expression, without delimiters. */
  readonly pattern: string;
  readonly path?: PathTarget;
  readonly provenance: Provenance;
}

/** Array uniqueness constraint. */
export interface ArrayCardinalityConstraintNode {
  readonly kind: "constraint";
  readonly constraintKind: "uniqueItems";
  readonly value: true;
  readonly path?: PathTarget;
  readonly provenance: Provenance;
}

/** Enum member subset constraint (refinement — only narrows). */
export interface EnumMemberConstraintNode {
  readonly kind: "constraint";
  readonly constraintKind: "allowedMembers";
  readonly members: readonly (string | number)[];
  readonly path?: PathTarget;
  readonly provenance: Provenance;
}

/** Literal-value equality constraint. */
export interface ConstConstraintNode {
  readonly kind: "constraint";
  readonly constraintKind: "const";
  readonly value: JsonValue;
  readonly path?: PathTarget;
  readonly provenance: Provenance;
}

/** Extension-registered custom constraint. */
export interface CustomConstraintNode {
  readonly kind: "constraint";
  readonly constraintKind: "custom";
  /** Extension-qualified ID: `"<vendor-prefix>/<extension-name>/<constraint-name>"` */
  readonly constraintId: string;
  /** JSON-serializable payload defined by the extension. */
  readonly payload: JsonValue;
  /** How this constraint composes with others of the same `constraintId`. */
  readonly compositionRule: "intersect" | "override";
  readonly path?: PathTarget;
  readonly provenance: Provenance;
}

// =============================================================================
// ANNOTATION NODES
// =============================================================================

/**
 * Discriminated union of all annotation types.
 * Annotations are value-influencing: they describe or present a field
 * but do not affect which values are valid.
 */
export type AnnotationNode =
  | DisplayNameAnnotationNode
  | DescriptionAnnotationNode
  | FormatAnnotationNode
  | PlaceholderAnnotationNode
  | DefaultValueAnnotationNode
  | DeprecatedAnnotationNode
  | FormatHintAnnotationNode
  | CustomAnnotationNode;

export interface DisplayNameAnnotationNode {
  readonly kind: "annotation";
  readonly annotationKind: "displayName";
  readonly value: string;
  readonly provenance: Provenance;
}

export interface DescriptionAnnotationNode {
  readonly kind: "annotation";
  readonly annotationKind: "description";
  readonly value: string;
  readonly provenance: Provenance;
}

/** Schema format annotation (e.g. email/date/uri). */
export interface FormatAnnotationNode {
  readonly kind: "annotation";
  readonly annotationKind: "format";
  readonly value: string;
  readonly provenance: Provenance;
}

export interface PlaceholderAnnotationNode {
  readonly kind: "annotation";
  readonly annotationKind: "placeholder";
  readonly value: string;
  readonly provenance: Provenance;
}

export interface DefaultValueAnnotationNode {
  readonly kind: "annotation";
  readonly annotationKind: "defaultValue";
  /** Must be JSON-serializable and type-compatible (verified during Validate phase). */
  readonly value: JsonValue;
  readonly provenance: Provenance;
}

export interface DeprecatedAnnotationNode {
  readonly kind: "annotation";
  readonly annotationKind: "deprecated";
  /** Optional deprecation message. */
  readonly message?: string;
  readonly provenance: Provenance;
}

/**
 * UI rendering hint — does not affect schema validation.
 * Unlike FormatAnnotationNode, this never emits a JSON Schema `format`.
 */
export interface FormatHintAnnotationNode {
  readonly kind: "annotation";
  readonly annotationKind: "formatHint";
  /** Renderer-specific format identifier: "textarea", "radio", "date", "color", etc. */
  readonly format: string;
  readonly provenance: Provenance;
}

/** Extension-registered custom annotation. */
export interface CustomAnnotationNode {
  readonly kind: "annotation";
  readonly annotationKind: "custom";
  /** Extension-qualified ID: `"<vendor-prefix>/<extension-name>/<annotation-name>"` */
  readonly annotationId: string;
  readonly value: JsonValue;
  readonly provenance: Provenance;
}

// =============================================================================
// FIELD NODE
// =============================================================================

/** A single form field after canonicalization. */
export interface FieldNode {
  readonly kind: "field";
  /** The field's key in the data schema. */
  readonly name: string;
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

/** Union of layout node types. */
export type LayoutNode = GroupLayoutNode | ConditionalLayoutNode;

/** A visual grouping of form elements. */
export interface GroupLayoutNode {
  readonly kind: "group";
  readonly label: string;
  /** Elements contained in this group — may be fields or nested groups. */
  readonly elements: readonly FormIRElement[];
  readonly provenance: Provenance;
}

/** Conditional visibility based on another field's value. */
export interface ConditionalLayoutNode {
  readonly kind: "conditional";
  /** The field whose value triggers visibility. */
  readonly fieldName: string;
  /** The value that makes the condition true (SHOW). */
  readonly value: JsonValue;
  /** Elements shown when the condition is met. */
  readonly elements: readonly FormIRElement[];
  readonly provenance: Provenance;
}

/** Union of all IR element types. */
export type FormIRElement = FieldNode | LayoutNode;

// =============================================================================
// TYPE REGISTRY
// =============================================================================

/** A named type definition stored in the type registry. */
export interface TypeDefinition {
  /** The fully-qualified reference name (key in the registry). */
  readonly name: string;
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
 */
export interface FormIR {
  readonly kind: "form-ir";
  /**
   * Schema version for the IR format itself.
   * Should equal `IR_VERSION`.
   */
  readonly irVersion: string;
  /** Top-level elements of the form: fields and layout nodes. */
  readonly elements: readonly FormIRElement[];
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
