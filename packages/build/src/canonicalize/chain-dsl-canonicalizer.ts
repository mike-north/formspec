/**
 * Canonicalizer that translates chain DSL `FormSpec` objects into the
 * canonical FormIR intermediate representation.
 *
 * This module maps the runtime objects produced by `@formspec/dsl` builder
 * functions (`field.*`, `group`, `when`, `formspec`) into the IR that all
 * downstream phases (validation, JSON Schema generation, UI Schema generation)
 * consume.
 */

import type {
  // Source types (chain DSL)
  AnyField,
  ArrayField,
  BooleanField,
  Conditional,
  DynamicEnumField,
  DynamicSchemaField,
  EnumOptionValue,
  FormElement,
  FormSpec,
  Group,
  NumberField,
  ObjectField,
  StaticEnumField,
  TextField,
  MetadataPolicyInput,
} from "@formspec/core";
import type {
  // IR types
  JsonValue,
  AnnotationNode,
  ArrayTypeNode,
  ConstraintNode,
  ConditionalLayoutNode,
  DisplayNameAnnotationNode,
  DynamicTypeNode,
  EnumMember,
  EnumTypeNode,
  FieldNode,
  FormIR,
  FormIRElement,
  GroupLayoutNode,
  LengthConstraintNode,
  NumericConstraintNode,
  ObjectProperty,
  PatternConstraintNode,
  ObjectTypeNode,
  PlaceholderAnnotationNode,
  PrimitiveTypeNode,
  Provenance,
  ResolvedMetadata,
  TypeNode,
} from "@formspec/core/internals";
import { IR_VERSION, _getFormSpecMetadataPolicy } from "@formspec/core/internals";
import {
  getDeclarationMetadataPolicy,
  makeMetadataContext,
  normalizeMetadataPolicy,
  resolveMetadata,
} from "../metadata/index.js";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default provenance for chain DSL nodes (no source location available). */
const CHAIN_DSL_PROVENANCE: Provenance = {
  surface: "chain-dsl",
  file: "",
  line: 0,
  column: 0,
} as const;

// =============================================================================
// TYPE GUARDS
// =============================================================================

function isGroup(el: FormElement): el is Group<readonly FormElement[]> {
  return el._type === "group";
}

function isConditional(
  el: FormElement
): el is Conditional<string, unknown, readonly FormElement[]> {
  return el._type === "conditional";
}

function isField(el: FormElement): el is AnyField {
  return el._type === "field";
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Translates a chain DSL `FormSpec` into the canonical `FormIR`.
 *
 * @param form - A form specification created via `formspec(...)` from `@formspec/dsl`
 * @returns The canonical intermediate representation
 */
export interface CanonicalizeChainDSLOptions {
  readonly metadata?: MetadataPolicyInput;
}

export function canonicalizeChainDSL(
  form: FormSpec<readonly FormElement[]>,
  options?: CanonicalizeChainDSLOptions
): FormIR {
  const metadataPolicy = normalizeMetadataPolicy(
    options?.metadata ?? _getFormSpecMetadataPolicy(form)
  );
  return {
    kind: "form-ir",
    irVersion: IR_VERSION,
    elements: canonicalizeElements(form.elements, metadataPolicy),
    rootAnnotations: [],
    typeRegistry: {},
    provenance: CHAIN_DSL_PROVENANCE,
  };
}

// =============================================================================
// ELEMENT CANONICALIZATION
// =============================================================================

/**
 * Canonicalizes an array of chain DSL form elements into IR elements.
 */
function canonicalizeElements(
  elements: readonly FormElement[],
  metadataPolicy: ReturnType<typeof normalizeMetadataPolicy>
): FormIRElement[] {
  return elements.map((element) => canonicalizeElement(element, metadataPolicy));
}

/**
 * Dispatches a single form element to its specific canonicalization function.
 */
function canonicalizeElement(
  element: FormElement,
  metadataPolicy: ReturnType<typeof normalizeMetadataPolicy>
): FormIRElement {
  if (isField(element)) {
    return canonicalizeField(element, metadataPolicy);
  }
  if (isGroup(element)) {
    return canonicalizeGroup(element, metadataPolicy);
  }
  if (isConditional(element)) {
    return canonicalizeConditional(element, metadataPolicy);
  }
  const _exhaustive: never = element;
  throw new Error(`Unknown element type: ${JSON.stringify(_exhaustive)}`);
}

// =============================================================================
// FIELD CANONICALIZATION
// =============================================================================

/**
 * Dispatches a field element to its type-specific canonicalization function.
 */
function canonicalizeField(
  field: AnyField,
  metadataPolicy: ReturnType<typeof normalizeMetadataPolicy>
): FieldNode {
  switch (field._field) {
    case "text":
      return canonicalizeTextField(field, metadataPolicy);
    case "number":
      return canonicalizeNumberField(field, metadataPolicy);
    case "boolean":
      return canonicalizeBooleanField(field, metadataPolicy);
    case "enum":
      return canonicalizeStaticEnumField(field, metadataPolicy);
    case "dynamic_enum":
      return canonicalizeDynamicEnumField(field, metadataPolicy);
    case "dynamic_schema":
      return canonicalizeDynamicSchemaField(field, metadataPolicy);
    case "array":
      return canonicalizeArrayField(field, metadataPolicy);
    case "object":
      return canonicalizeObjectField(field, metadataPolicy);
    default: {
      const _exhaustive: never = field;
      throw new Error(`Unknown field type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// =============================================================================
// SPECIFIC FIELD TYPE CANONICALIZERS
// =============================================================================

function canonicalizeTextField(
  field: TextField<string>,
  metadataPolicy: ReturnType<typeof normalizeMetadataPolicy>
): FieldNode {
  const type: PrimitiveTypeNode = { kind: "primitive", primitiveKind: "string" };
  const constraints: ConstraintNode[] = [];

  if (field.minLength !== undefined) {
    const c: LengthConstraintNode = {
      kind: "constraint",
      constraintKind: "minLength",
      value: field.minLength,
      provenance: CHAIN_DSL_PROVENANCE,
    };
    constraints.push(c);
  }

  if (field.maxLength !== undefined) {
    const c: LengthConstraintNode = {
      kind: "constraint",
      constraintKind: "maxLength",
      value: field.maxLength,
      provenance: CHAIN_DSL_PROVENANCE,
    };
    constraints.push(c);
  }

  if (field.pattern !== undefined) {
    const c: PatternConstraintNode = {
      kind: "constraint",
      constraintKind: "pattern",
      pattern: field.pattern,
      provenance: CHAIN_DSL_PROVENANCE,
    };
    constraints.push(c);
  }

  return buildFieldNode(
    field.name,
    resolveFieldMetadata(field.name, field, metadataPolicy),
    type,
    field.required,
    buildAnnotations(getExplicitDisplayName(field), field.placeholder),
    constraints
  );
}

function canonicalizeNumberField(
  field: NumberField<string>,
  metadataPolicy: ReturnType<typeof normalizeMetadataPolicy>
): FieldNode {
  const type: PrimitiveTypeNode = { kind: "primitive", primitiveKind: "number" };
  const constraints: ConstraintNode[] = [];

  if (field.min !== undefined) {
    const c: NumericConstraintNode = {
      kind: "constraint",
      constraintKind: "minimum",
      value: field.min,
      provenance: CHAIN_DSL_PROVENANCE,
    };
    constraints.push(c);
  }

  if (field.max !== undefined) {
    const c: NumericConstraintNode = {
      kind: "constraint",
      constraintKind: "maximum",
      value: field.max,
      provenance: CHAIN_DSL_PROVENANCE,
    };
    constraints.push(c);
  }

  if (field.multipleOf !== undefined) {
    const c: NumericConstraintNode = {
      kind: "constraint",
      constraintKind: "multipleOf",
      value: field.multipleOf,
      provenance: CHAIN_DSL_PROVENANCE,
    };
    constraints.push(c);
  }

  return buildFieldNode(
    field.name,
    resolveFieldMetadata(field.name, field, metadataPolicy),
    type,
    field.required,
    buildAnnotations(getExplicitDisplayName(field)),
    constraints
  );
}

function canonicalizeBooleanField(
  field: BooleanField<string>,
  metadataPolicy: ReturnType<typeof normalizeMetadataPolicy>
): FieldNode {
  const type: PrimitiveTypeNode = { kind: "primitive", primitiveKind: "boolean" };
  return buildFieldNode(
    field.name,
    resolveFieldMetadata(field.name, field, metadataPolicy),
    type,
    field.required,
    buildAnnotations(getExplicitDisplayName(field))
  );
}

function canonicalizeStaticEnumField(
  field: StaticEnumField<string, readonly EnumOptionValue[]>,
  metadataPolicy: ReturnType<typeof normalizeMetadataPolicy>
): FieldNode {
  const members: EnumMember[] = field.options.map((opt) => {
    if (typeof opt === "string") {
      return { value: opt } satisfies EnumMember;
    }
    // Object option with id/label
    return { value: opt.id, displayName: opt.label } satisfies EnumMember;
  });

  const type: EnumTypeNode = { kind: "enum", members };
  return buildFieldNode(
    field.name,
    resolveFieldMetadata(field.name, field, metadataPolicy),
    type,
    field.required,
    buildAnnotations(getExplicitDisplayName(field))
  );
}

function canonicalizeDynamicEnumField(
  field: DynamicEnumField<string, string>,
  metadataPolicy: ReturnType<typeof normalizeMetadataPolicy>
): FieldNode {
  const type: DynamicTypeNode = {
    kind: "dynamic",
    dynamicKind: "enum",
    sourceKey: field.source,
    parameterFields: field.params ? [...field.params] : [],
  };
  return buildFieldNode(
    field.name,
    resolveFieldMetadata(field.name, field, metadataPolicy),
    type,
    field.required,
    buildAnnotations(getExplicitDisplayName(field))
  );
}

function canonicalizeDynamicSchemaField(
  field: DynamicSchemaField<string>,
  metadataPolicy: ReturnType<typeof normalizeMetadataPolicy>
): FieldNode {
  const type: DynamicTypeNode = {
    kind: "dynamic",
    dynamicKind: "schema",
    sourceKey: field.schemaSource,
    parameterFields: [],
  };
  return buildFieldNode(
    field.name,
    resolveFieldMetadata(field.name, field, metadataPolicy),
    type,
    field.required,
    buildAnnotations(getExplicitDisplayName(field))
  );
}

function canonicalizeArrayField(
  field: ArrayField<string, readonly FormElement[]>,
  metadataPolicy: ReturnType<typeof normalizeMetadataPolicy>
): FieldNode {
  // Array items form an object type from the sub-elements
  const itemProperties = buildObjectProperties(field.items, metadataPolicy);
  const itemsType: ObjectTypeNode = {
    kind: "object",
    properties: itemProperties,
    additionalProperties: true,
  };
  const type: ArrayTypeNode = { kind: "array", items: itemsType };

  const constraints: ConstraintNode[] = [];
  if (field.minItems !== undefined) {
    const c: LengthConstraintNode = {
      kind: "constraint",
      constraintKind: "minItems",
      value: field.minItems,
      provenance: CHAIN_DSL_PROVENANCE,
    };
    constraints.push(c);
  }
  if (field.maxItems !== undefined) {
    const c: LengthConstraintNode = {
      kind: "constraint",
      constraintKind: "maxItems",
      value: field.maxItems,
      provenance: CHAIN_DSL_PROVENANCE,
    };
    constraints.push(c);
  }

  return buildFieldNode(
    field.name,
    resolveFieldMetadata(field.name, field, metadataPolicy),
    type,
    field.required,
    buildAnnotations(getExplicitDisplayName(field)),
    constraints
  );
}

function canonicalizeObjectField(
  field: ObjectField<string, readonly FormElement[]>,
  metadataPolicy: ReturnType<typeof normalizeMetadataPolicy>
): FieldNode {
  const properties = buildObjectProperties(field.properties, metadataPolicy);
  const type: ObjectTypeNode = {
    kind: "object",
    properties,
    additionalProperties: true,
  };
  return buildFieldNode(
    field.name,
    resolveFieldMetadata(field.name, field, metadataPolicy),
    type,
    field.required,
    buildAnnotations(getExplicitDisplayName(field))
  );
}

// =============================================================================
// LAYOUT CANONICALIZATION
// =============================================================================

function canonicalizeGroup(
  g: Group<readonly FormElement[]>,
  metadataPolicy: ReturnType<typeof normalizeMetadataPolicy>
): GroupLayoutNode {
  return {
    kind: "group",
    label: g.label,
    elements: canonicalizeElements(g.elements, metadataPolicy),
    provenance: CHAIN_DSL_PROVENANCE,
  };
}

function canonicalizeConditional(
  c: Conditional<string, unknown, readonly FormElement[]>,
  metadataPolicy: ReturnType<typeof normalizeMetadataPolicy>
): ConditionalLayoutNode {
  return {
    kind: "conditional",
    fieldName: c.field,
    // Conditional values from the chain DSL are JSON-serializable primitives
    // (strings, numbers, booleans) produced by the `is()` predicate helper.
    value: assertJsonValue(c.value),
    elements: canonicalizeElements(c.elements, metadataPolicy),
    provenance: CHAIN_DSL_PROVENANCE,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Validates that a value is JSON-serializable (`JsonValue`).
 * The chain DSL's `is()` helper constrains conditional values to
 * JSON-compatible primitives, but the TypeScript type is `unknown`.
 * This runtime guard replaces an `as` cast with a validated assertion.
 */
function assertJsonValue(v: unknown): JsonValue {
  if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return v;
  }
  if (Array.isArray(v)) {
    return v.map(assertJsonValue);
  }
  if (typeof v === "object") {
    const result: Record<string, JsonValue> = {};
    for (const [key, val] of Object.entries(v)) {
      result[key] = assertJsonValue(val);
    }
    return result;
  }
  // Remaining types (function, symbol, bigint, undefined) are not JSON-serializable
  throw new TypeError(`Conditional value is not a valid JsonValue: ${typeof v}`);
}

/**
 * Builds a FieldNode from common field properties.
 */
function buildFieldNode(
  name: string,
  metadata: ResolvedMetadata | undefined,
  type: TypeNode,
  required: boolean | undefined,
  annotations: AnnotationNode[],
  constraints: ConstraintNode[] = []
): FieldNode {
  return {
    kind: "field",
    name,
    ...(metadata !== undefined && { metadata }),
    type,
    required: required === true,
    constraints,
    annotations,
    provenance: CHAIN_DSL_PROVENANCE,
  };
}

/**
 * Builds annotation nodes from optional label and placeholder values.
 */
function buildAnnotations(label?: string, placeholder?: string): AnnotationNode[] {
  const annotations: AnnotationNode[] = [];

  if (label !== undefined) {
    const a: DisplayNameAnnotationNode = {
      kind: "annotation",
      annotationKind: "displayName",
      value: label,
      provenance: CHAIN_DSL_PROVENANCE,
    };
    annotations.push(a);
  }

  if (placeholder !== undefined) {
    const a: PlaceholderAnnotationNode = {
      kind: "annotation",
      annotationKind: "placeholder",
      value: placeholder,
      provenance: CHAIN_DSL_PROVENANCE,
    };
    annotations.push(a);
  }

  return annotations;
}

/**
 * Converts an array of form elements into ObjectProperty nodes.
 * Used for ObjectField properties and ArrayField items.
 *
 * Only field elements produce properties; groups and conditionals within
 * an object/array context are recursively flattened to extract their fields.
 *
 * Fields inside conditional branches are always marked `optional: true`
 * because their presence in the data depends on the condition being met.
 * This matches the DSL's type inference behavior where conditional fields
 * produce optional properties in `InferFormSchema`.
 *
 * @param elements - The form elements to convert
 * @param insideConditional - Whether these elements are inside a conditional branch
 */
function buildObjectProperties(
  elements: readonly FormElement[],
  metadataPolicy: ReturnType<typeof normalizeMetadataPolicy>,
  insideConditional = false
): ObjectProperty[] {
  const properties: ObjectProperty[] = [];

  for (const el of elements) {
    if (isField(el)) {
      const fieldNode = canonicalizeField(el, metadataPolicy);
      properties.push({
        name: fieldNode.name,
        ...(fieldNode.metadata !== undefined && { metadata: fieldNode.metadata }),
        type: fieldNode.type,
        // Fields inside a conditional branch are always optional in the
        // data schema, regardless of their `required` flag — the condition
        // may not be met, so the field may be absent.
        optional: insideConditional || !fieldNode.required,
        constraints: fieldNode.constraints,
        annotations: fieldNode.annotations,
        provenance: CHAIN_DSL_PROVENANCE,
      });
    } else if (isGroup(el)) {
      // Groups inside object/array items contribute their fields by flattening.
      // Groups do not affect optionality — pass through the current state.
      properties.push(...buildObjectProperties(el.elements, metadataPolicy, insideConditional));
    } else if (isConditional(el)) {
      // Conditionals inside object/array items contribute their fields by
      // flattening, but all fields inside are forced optional.
      properties.push(...buildObjectProperties(el.elements, metadataPolicy, true));
    }
  }

  return properties;
}

function getExplicitDisplayName(field: {
  readonly label?: string;
  readonly displayName?: string;
}): string | undefined {
  if (field.label !== undefined && field.displayName !== undefined) {
    throw new Error('Chain DSL fields cannot specify both "label" and "displayName".');
  }
  return field.displayName ?? field.label;
}

function resolveFieldMetadata(
  logicalName: string,
  field: {
    readonly apiName?: string;
    readonly label?: string;
    readonly displayName?: string;
  },
  metadataPolicy: ReturnType<typeof normalizeMetadataPolicy>
): ResolvedMetadata | undefined {
  const displayName = getExplicitDisplayName(field);
  return resolveMetadata(
    {
      ...(field.apiName !== undefined && { apiName: field.apiName }),
      ...(displayName !== undefined && { displayName }),
    },
    getDeclarationMetadataPolicy(metadataPolicy, "field"),
    makeMetadataContext("chain-dsl", "field", logicalName)
  );
}
