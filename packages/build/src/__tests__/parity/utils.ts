/**
 * Parity testing utilities.
 *
 * Provides:
 * - `ProvenanceFree<T>` — type-level mapper that strips `provenance` fields from IR nodes
 * - `stripProvenance(ir)` — runtime equivalent for `FormIR`
 * - `compareIR(a, b)` — structured IR comparison after stripping provenance
 * - narrow parity normalization for TSDoc-only helper types the chain DSL
 *   cannot express directly
 *
 * `ProvenanceFree<T>` is implemented as explicit per-type mapped interfaces
 * rather than a generic deep-recursive mapped type. This keeps the type
 * system's structural guarantees intact: if an IR node gains or loses a
 * field, the provenance-free variants here will fail to compile, catching
 * shape regressions at type-check time.
 */

import type {
  FormIR,
  FormIRElement,
  FieldNode,
  GroupLayoutNode,
  ConditionalLayoutNode,
  TypeNode,
  PrimitiveTypeNode,
  EnumMember,
  ObjectTypeNode,
  ObjectProperty,
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
  JsonValue,
} from "@formspec/core/internals";

// =============================================================================
// ProvenanceFree — typed recursive mapper (NOT generic deep recursion)
//
// For each IR interface that carries a `provenance` field, we produce a version
// with that field omitted. Every nested structure is mapped explicitly so the
// type system validates the shape at compile time.
// =============================================================================

/** Primitive type node has no `provenance` field — pass through unchanged. */
export type ProvenanceFreePrimitiveTypeNode = PrimitiveTypeNode;

/** Enum member has no `provenance` field. */
export type ProvenanceFreeEnumMember = EnumMember;

/** Enum type node has no `provenance` field. */
export interface ProvenanceFreeEnumTypeNode {
  readonly kind: "enum";
  readonly members: readonly ProvenanceFreeEnumMember[];
}

/** Array type node — items type is recursively provenance-free. */
export interface ProvenanceFreeArrayTypeNode {
  readonly kind: "array";
  readonly items: ProvenanceFreeTypeNode;
}

/** Object property with `provenance` stripped and nested types recursively mapped. */
export interface ProvenanceFreeObjectProperty {
  readonly name: string;
  readonly type: ProvenanceFreeTypeNode;
  readonly optional: boolean;
  readonly constraints: readonly ProvenanceFreeConstraintNode[];
  readonly annotations: readonly ProvenanceFreeAnnotationNode[];
  // `provenance` intentionally omitted
}

/** Object type node — properties are recursively provenance-free. */
export interface ProvenanceFreeObjectTypeNode {
  readonly kind: "object";
  readonly properties: readonly ProvenanceFreeObjectProperty[];
  readonly additionalProperties: boolean;
}

/** Record type node — valueType is recursively provenance-free. */
export interface ProvenanceFreeRecordTypeNode {
  readonly kind: "record";
  readonly valueType: ProvenanceFreeTypeNode;
}

/** Union type node — members are recursively provenance-free. */
export interface ProvenanceFreeUnionTypeNode {
  readonly kind: "union";
  readonly members: readonly ProvenanceFreeTypeNode[];
}

/** Reference type node — type arguments are recursively provenance-free. */
export interface ProvenanceFreeReferenceTypeNode {
  readonly kind: "reference";
  readonly name: string;
  readonly typeArguments: readonly ProvenanceFreeTypeNode[];
}

/** Dynamic type node has no `provenance` field — pass through unchanged. */
export type ProvenanceFreeDynamicTypeNode = DynamicTypeNode;

/** Custom type node has no `provenance` field — pass through unchanged. */
export type ProvenanceFreeCustomTypeNode = CustomTypeNode;

/** Union of all provenance-free type node variants. */
export type ProvenanceFreeTypeNode =
  | ProvenanceFreePrimitiveTypeNode
  | ProvenanceFreeEnumTypeNode
  | ProvenanceFreeArrayTypeNode
  | ProvenanceFreeObjectTypeNode
  | ProvenanceFreeRecordTypeNode
  | ProvenanceFreeUnionTypeNode
  | ProvenanceFreeReferenceTypeNode
  | ProvenanceFreeDynamicTypeNode
  | ProvenanceFreeCustomTypeNode;

// Constraint nodes all carry `provenance` — strip it from each variant.

export type ProvenanceFreeNumericConstraintNode = Omit<NumericConstraintNode, "provenance">;
export type ProvenanceFreeLengthConstraintNode = Omit<LengthConstraintNode, "provenance">;
export type ProvenanceFreePatternConstraintNode = Omit<PatternConstraintNode, "provenance">;
export type ProvenanceFreeArrayCardinalityConstraintNode = Omit<
  ArrayCardinalityConstraintNode,
  "provenance"
>;
export type ProvenanceFreeEnumMemberConstraintNode = Omit<EnumMemberConstraintNode, "provenance">;
export type ProvenanceFreeConstConstraintNode = Omit<ConstConstraintNode, "provenance">;
export type ProvenanceFreeCustomConstraintNode = Omit<CustomConstraintNode, "provenance">;

export type ProvenanceFreeConstraintNode =
  | ProvenanceFreeNumericConstraintNode
  | ProvenanceFreeLengthConstraintNode
  | ProvenanceFreePatternConstraintNode
  | ProvenanceFreeArrayCardinalityConstraintNode
  | ProvenanceFreeEnumMemberConstraintNode
  | ProvenanceFreeConstConstraintNode
  | ProvenanceFreeCustomConstraintNode;

// Annotation nodes all carry `provenance` — strip it from each variant.

export type ProvenanceFreeDisplayNameAnnotationNode = Omit<DisplayNameAnnotationNode, "provenance">;
export type ProvenanceFreeDescriptionAnnotationNode = Omit<DescriptionAnnotationNode, "provenance">;
export type ProvenanceFreeFormatAnnotationNode = Omit<FormatAnnotationNode, "provenance">;
export type ProvenanceFreePlaceholderAnnotationNode = Omit<PlaceholderAnnotationNode, "provenance">;
export type ProvenanceFreeDefaultValueAnnotationNode = Omit<
  DefaultValueAnnotationNode,
  "provenance"
>;
export type ProvenanceFreeDeprecatedAnnotationNode = Omit<DeprecatedAnnotationNode, "provenance">;
export type ProvenanceFreeFormatHintAnnotationNode = Omit<FormatHintAnnotationNode, "provenance">;
export type ProvenanceFreeRemarksAnnotationNode = Omit<RemarksAnnotationNode, "provenance">;
export type ProvenanceFreeCustomAnnotationNode = Omit<CustomAnnotationNode, "provenance">;

export type ProvenanceFreeAnnotationNode =
  | ProvenanceFreeDisplayNameAnnotationNode
  | ProvenanceFreeDescriptionAnnotationNode
  | ProvenanceFreeRemarksAnnotationNode
  | ProvenanceFreeFormatAnnotationNode
  | ProvenanceFreePlaceholderAnnotationNode
  | ProvenanceFreeDefaultValueAnnotationNode
  | ProvenanceFreeDeprecatedAnnotationNode
  | ProvenanceFreeFormatHintAnnotationNode
  | ProvenanceFreeCustomAnnotationNode;

/** Field node with `provenance` and `mergeHistory` stripped; nested structures recursively mapped. */
export interface ProvenanceFreeFieldNode {
  readonly kind: "field";
  readonly name: string;
  readonly type: ProvenanceFreeTypeNode;
  readonly required: boolean;
  readonly constraints: readonly ProvenanceFreeConstraintNode[];
  readonly annotations: readonly ProvenanceFreeAnnotationNode[];
  // `provenance` and `mergeHistory` intentionally omitted
}

/** Group layout node with `provenance` stripped; elements are recursively mapped. */
export interface ProvenanceFreeGroupLayoutNode {
  readonly kind: "group";
  readonly label: string;
  readonly elements: readonly ProvenanceFreeFormIRElement[];
  // `provenance` intentionally omitted
}

/** Conditional layout node with `provenance` stripped. */
export interface ProvenanceFreeConditionalLayoutNode {
  readonly kind: "conditional";
  readonly fieldName: string;
  readonly value: JsonValue;
  readonly elements: readonly ProvenanceFreeFormIRElement[];
  // `provenance` intentionally omitted
}

/** Union of all provenance-free IR element types. */
export type ProvenanceFreeFormIRElement =
  | ProvenanceFreeFieldNode
  | ProvenanceFreeGroupLayoutNode
  | ProvenanceFreeConditionalLayoutNode;

/** TypeDefinition with `provenance` stripped. */
export interface ProvenanceFreeTypeDefinition {
  readonly name: string;
  readonly type: ProvenanceFreeTypeNode;
  readonly constraints?: readonly ProvenanceFreeConstraintNode[];
  readonly annotations?: readonly ProvenanceFreeAnnotationNode[];
  // `provenance` intentionally omitted
}

/** The top-level `FormIR` with all `provenance` fields stripped. */
export interface ProvenanceFreeFormIR {
  readonly kind: "form-ir";
  readonly irVersion: string;
  readonly elements: readonly ProvenanceFreeFormIRElement[];
  readonly typeRegistry: Record<string, ProvenanceFreeTypeDefinition>;
  // `provenance` intentionally omitted
}

// =============================================================================
// Structured difference type
// =============================================================================

/**
 * A structured description of a single difference between two IR trees.
 * Path uses dot notation for object properties and `[n]` for array indices.
 */
export interface IRDifference {
  /** JSONPath-like string describing where the difference is located. */
  readonly path: string;
  readonly expected: unknown;
  readonly actual: unknown;
}

// =============================================================================
// Runtime: stripProvenance
// =============================================================================

/**
 * Strips all `provenance` (and `mergeHistory`) fields from a `FormIRElement`,
 * returning a `ProvenanceFreeFormIRElement`.
 */
export function stripProvenanceFromElement(element: FormIRElement): ProvenanceFreeFormIRElement {
  switch (element.kind) {
    case "field":
      return stripProvenanceFromField(element);
    case "group":
      return stripProvenanceFromGroup(element);
    case "conditional":
      return stripProvenanceFromConditional(element);
  }
}

function stripProvenanceFromField(field: FieldNode): ProvenanceFreeFieldNode {
  return {
    kind: "field",
    name: field.name,
    type: stripProvenanceFromTypeNode(field.type),
    required: field.required,
    constraints: field.constraints.map(stripProvenanceFromConstraint),
    annotations: field.annotations.map(stripProvenanceFromAnnotation),
  };
}

function stripProvenanceFromGroup(group: GroupLayoutNode): ProvenanceFreeGroupLayoutNode {
  return {
    kind: "group",
    label: group.label,
    elements: group.elements.map(stripProvenanceFromElement),
  };
}

function stripProvenanceFromConditional(
  cond: ConditionalLayoutNode
): ProvenanceFreeConditionalLayoutNode {
  return {
    kind: "conditional",
    fieldName: cond.fieldName,
    value: cond.value,
    elements: cond.elements.map(stripProvenanceFromElement),
  };
}

function stripProvenanceFromTypeNode(type: TypeNode): ProvenanceFreeTypeNode {
  switch (type.kind) {
    case "primitive":
      return type;
    case "enum":
      return { kind: "enum", members: [...type.members] };
    case "array":
      return { kind: "array", items: stripProvenanceFromTypeNode(type.items) };
    case "object":
      return stripProvenanceFromObjectType(type);
    case "record":
      return { kind: "record", valueType: stripProvenanceFromTypeNode(type.valueType) };
    case "union":
      return {
        kind: "union",
        members: type.members.map(stripProvenanceFromTypeNode),
      };
    case "reference":
      return {
        kind: "reference",
        name: type.name,
        typeArguments: type.typeArguments.map(stripProvenanceFromTypeNode),
      };
    case "dynamic":
      return type;
    case "custom":
      return type;
  }
}

function stripProvenanceFromObjectType(type: ObjectTypeNode): ProvenanceFreeObjectTypeNode {
  return {
    kind: "object",
    properties: type.properties.map(stripProvenanceFromObjectProperty),
    additionalProperties: type.additionalProperties,
  };
}

function stripProvenanceFromObjectProperty(prop: ObjectProperty): ProvenanceFreeObjectProperty {
  return {
    name: prop.name,
    type: stripProvenanceFromTypeNode(prop.type),
    optional: prop.optional,
    constraints: prop.constraints.map(stripProvenanceFromConstraint),
    annotations: prop.annotations.map(stripProvenanceFromAnnotation),
  };
}

function stripProvenanceFromConstraint(constraint: ConstraintNode): ProvenanceFreeConstraintNode {
  // Destructure to drop `provenance` from each variant.
  switch (constraint.constraintKind) {
    case "minimum":
    case "maximum":
    case "exclusiveMinimum":
    case "exclusiveMaximum":
    case "multipleOf": {
      const { provenance: _p, ...rest } = constraint;
      return rest;
    }
    case "minLength":
    case "maxLength":
    case "minItems":
    case "maxItems": {
      const { provenance: _p, ...rest } = constraint;
      return rest;
    }
    case "pattern": {
      const { provenance: _p, ...rest } = constraint;
      return rest;
    }
    case "uniqueItems": {
      const { provenance: _p, ...rest } = constraint;
      return rest;
    }
    case "const": {
      const { provenance: _p, ...rest } = constraint;
      return rest;
    }
    case "allowedMembers": {
      const { provenance: _p, ...rest } = constraint;
      return rest;
    }
    case "custom": {
      const { provenance: _p, ...rest } = constraint;
      return rest;
    }
  }
}

function stripProvenanceFromAnnotation(annotation: AnnotationNode): ProvenanceFreeAnnotationNode {
  switch (annotation.annotationKind) {
    case "displayName":
    case "description":
    case "remarks":
    case "format":
    case "placeholder":
    case "defaultValue":
    case "deprecated":
    case "formatHint":
    case "custom": {
      const { provenance: _p, ...rest } = annotation;
      return rest;
    }
  }
}

/**
 * Strips all `provenance` and `mergeHistory` fields from a complete `FormIR`,
 * returning a `ProvenanceFreeFormIR` suitable for structural comparison.
 */
export function stripProvenance(ir: FormIR): ProvenanceFreeFormIR {
  const typeRegistry: Record<string, ProvenanceFreeTypeDefinition> = {};

  for (const [key, def] of Object.entries(ir.typeRegistry)) {
    typeRegistry[key] = {
      name: def.name,
      type: stripProvenanceFromTypeNode(def.type),
      ...(def.constraints &&
        def.constraints.length > 0 && {
          constraints: def.constraints.map(stripProvenanceFromConstraint),
        }),
      ...(def.annotations &&
        def.annotations.length > 0 && {
          annotations: def.annotations.map(stripProvenanceFromAnnotation),
        }),
    };
  }

  return normalizePrimitiveAliasParity({
    kind: "form-ir",
    irVersion: ir.irVersion,
    elements: ir.elements.map(stripProvenanceFromElement),
    typeRegistry,
  });
}

/**
 * Parity compares authoring-surface semantics, not whether one surface chose to
 * preserve a named primitive alias in the registry. Inline those aliases back
 * onto fields for comparison while leaving non-primitive named types intact.
 */
function normalizePrimitiveAliasParity(ir: ProvenanceFreeFormIR): ProvenanceFreeFormIR {
  const primitiveDefs = new Map(
    Object.entries(ir.typeRegistry).filter(
      ([, def]) => def.type.kind === "primitive" && def.constraints && def.constraints.length > 0
    )
  );

  if (primitiveDefs.size === 0) {
    return ir;
  }

  const elements = ir.elements.map((element) =>
    normalizePrimitiveAliasElement(element, primitiveDefs)
  );
  const typeRegistry = Object.fromEntries(
    Object.entries(ir.typeRegistry).filter(([key]) => !primitiveDefs.has(key))
  );

  return {
    ...ir,
    elements,
    typeRegistry,
  };
}

function normalizePrimitiveAliasElement(
  element: ProvenanceFreeFormIRElement,
  primitiveDefs: Map<string, ProvenanceFreeTypeDefinition>
): ProvenanceFreeFormIRElement {
  switch (element.kind) {
    case "field":
      return normalizePrimitiveAliasField(element, primitiveDefs);
    case "group":
      return {
        ...element,
        elements: element.elements.map((child) =>
          normalizePrimitiveAliasElement(child, primitiveDefs)
        ),
      };
    case "conditional":
      return {
        ...element,
        elements: element.elements.map((child) =>
          normalizePrimitiveAliasElement(child, primitiveDefs)
        ),
      };
  }
}

function normalizePrimitiveAliasField(
  field: ProvenanceFreeFieldNode,
  primitiveDefs: Map<string, ProvenanceFreeTypeDefinition>
): ProvenanceFreeFieldNode {
  if (field.type.kind !== "reference") {
    return field;
  }

  const primitiveDef = primitiveDefs.get(field.type.name);
  if (primitiveDef?.type.kind !== "primitive") {
    return field;
  }

  return {
    ...field,
    type: primitiveDef.type,
    constraints: [...(primitiveDef.constraints ?? []), ...field.constraints],
  };
}

// =============================================================================
// Runtime: compareIR
// =============================================================================

/**
 * Compares two `FormIR` objects structurally after stripping provenance.
 *
 * Returns an empty array when the IRs are identical modulo provenance.
 * Returns one `IRDifference` per divergence found, with a JSONPath-like
 * path string indicating where the difference occurs.
 */
export function compareIR(a: FormIR, b: FormIR): IRDifference[] {
  const strippedA = stripProvenance(a);
  const strippedB = stripProvenance(b);
  const differences: IRDifference[] = [];

  collectDifferences(strippedA, strippedB, "", differences);

  return differences;
}

/**
 * Recursively collects structural differences between two values.
 * Populates the `out` array with any divergences found.
 */
function collectDifferences(a: unknown, b: unknown, path: string, out: IRDifference[]): void {
  if (a === b) return;

  // Both null/undefined — equal
  if (a == null && b == null) return;

  // One is null/undefined, the other is not
  if (a == null || b == null) {
    out.push({ path, expected: a, actual: b });
    return;
  }

  const typeA = typeof a;
  const typeB = typeof b;

  // Different primitive types
  if (typeA !== typeB) {
    out.push({ path, expected: a, actual: b });
    return;
  }

  // Primitive value mismatch (identity check above already handled a === b)
  if (typeA !== "object") {
    out.push({ path, expected: a, actual: b });
    return;
  }

  // Array comparison
  if (Array.isArray(a) && Array.isArray(b)) {
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      collectDifferences(a[i], b[i], `${path}[${String(i)}]`, out);
    }
    return;
  }

  // One is array, the other is not
  if (Array.isArray(a) !== Array.isArray(b)) {
    out.push({ path, expected: a, actual: b });
    return;
  }

  // Object comparison — collect all keys from both sides
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(objA), ...Object.keys(objB)]);

  for (const key of allKeys) {
    const childPath = path.length > 0 ? `${path}.${key}` : key;
    collectDifferences(objA[key], objB[key], childPath, out);
  }
}
