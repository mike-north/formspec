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
  // IR types
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
  ObjectTypeNode,
  PlaceholderAnnotationNode,
  PrimitiveTypeNode,
  Provenance,
  TypeNode,
} from "@formspec/core";
import { IR_VERSION } from "@formspec/core";

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
  el: FormElement,
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
export function canonicalizeDSL(form: FormSpec<readonly FormElement[]>): FormIR {
  return {
    kind: "form-ir",
    irVersion: IR_VERSION,
    elements: canonicalizeElements(form.elements),
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
function canonicalizeElements(elements: readonly FormElement[]): FormIRElement[] {
  return elements.map(canonicalizeElement);
}

/**
 * Dispatches a single form element to its specific canonicalization function.
 */
function canonicalizeElement(element: FormElement): FormIRElement {
  if (isField(element)) {
    return canonicalizeField(element);
  }
  if (isGroup(element)) {
    return canonicalizeGroup(element);
  }
  // isConditional — TypeScript knows this is the only remaining case
  return canonicalizeConditional(element as Conditional<string, unknown, readonly FormElement[]>);
}

// =============================================================================
// FIELD CANONICALIZATION
// =============================================================================

/**
 * Dispatches a field element to its type-specific canonicalization function.
 */
function canonicalizeField(field: AnyField): FieldNode {
  switch (field._field) {
    case "text":
      return canonicalizeTextField(field);
    case "number":
      return canonicalizeNumberField(field);
    case "boolean":
      return canonicalizeBooleanField(field);
    case "enum":
      return canonicalizeStaticEnumField(field);
    case "dynamic_enum":
      return canonicalizeDynamicEnumField(field);
    case "dynamic_schema":
      return canonicalizeDynamicSchemaField(field);
    case "array":
      return canonicalizeArrayField(field);
    case "object":
      return canonicalizeObjectField(field);
  }
}

// =============================================================================
// SPECIFIC FIELD TYPE CANONICALIZERS
// =============================================================================

function canonicalizeTextField(field: TextField<string>): FieldNode {
  const type: PrimitiveTypeNode = { kind: "primitive", primitiveKind: "string" };
  return buildFieldNode(
    field.name,
    type,
    field.required,
    buildAnnotations(field.label, field.placeholder),
  );
}

function canonicalizeNumberField(field: NumberField<string>): FieldNode {
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

  return buildFieldNode(
    field.name,
    type,
    field.required,
    buildAnnotations(field.label),
    constraints,
  );
}

function canonicalizeBooleanField(field: BooleanField<string>): FieldNode {
  const type: PrimitiveTypeNode = { kind: "primitive", primitiveKind: "boolean" };
  return buildFieldNode(field.name, type, field.required, buildAnnotations(field.label));
}

function canonicalizeStaticEnumField(
  field: StaticEnumField<string, readonly EnumOptionValue[]>,
): FieldNode {
  const members: EnumMember[] = field.options.map((opt) => {
    if (typeof opt === "string") {
      return { value: opt } satisfies EnumMember;
    }
    // Object option with id/label
    return { value: opt.id, displayName: opt.label } satisfies EnumMember;
  });

  const type: EnumTypeNode = { kind: "enum", members };
  return buildFieldNode(field.name, type, field.required, buildAnnotations(field.label));
}

function canonicalizeDynamicEnumField(field: DynamicEnumField<string, string>): FieldNode {
  const type: DynamicTypeNode = {
    kind: "dynamic",
    dynamicKind: "enum",
    sourceKey: field.source,
    parameterFields: field.params ? [...field.params] : [],
  };
  return buildFieldNode(field.name, type, field.required, buildAnnotations(field.label));
}

function canonicalizeDynamicSchemaField(field: DynamicSchemaField<string>): FieldNode {
  const type: DynamicTypeNode = {
    kind: "dynamic",
    dynamicKind: "schema",
    sourceKey: field.schemaSource,
    parameterFields: [],
  };
  return buildFieldNode(field.name, type, field.required, buildAnnotations(field.label));
}

function canonicalizeArrayField(field: ArrayField<string, readonly FormElement[]>): FieldNode {
  // Array items form an object type from the sub-elements
  const itemProperties = buildObjectProperties(field.items);
  const itemsType: ObjectTypeNode = {
    kind: "object",
    properties: itemProperties,
    additionalProperties: false,
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
    type,
    field.required,
    buildAnnotations(field.label),
    constraints,
  );
}

function canonicalizeObjectField(field: ObjectField<string, readonly FormElement[]>): FieldNode {
  const properties = buildObjectProperties(field.properties);
  const type: ObjectTypeNode = {
    kind: "object",
    properties,
    additionalProperties: false,
  };
  return buildFieldNode(field.name, type, field.required, buildAnnotations(field.label));
}

// =============================================================================
// LAYOUT CANONICALIZATION
// =============================================================================

function canonicalizeGroup(g: Group<readonly FormElement[]>): GroupLayoutNode {
  return {
    kind: "group",
    label: g.label,
    elements: canonicalizeElements(g.elements),
    provenance: CHAIN_DSL_PROVENANCE,
  };
}

function canonicalizeConditional(
  c: Conditional<string, unknown, readonly FormElement[]>,
): ConditionalLayoutNode {
  return {
    kind: "conditional",
    fieldName: c.field,
    // Conditional values from the chain DSL are JSON-serializable primitives
    // (strings, numbers, booleans) produced by the `is()` predicate helper.
    // The `value` field is typed as `unknown` in the DSL but is constrained
    // to JsonValue-compatible values by the runtime `is()` helper. We assert
    // this here since there is no static type-safe narrowing path available.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: c.value as ConditionalLayoutNode["value"],
    elements: canonicalizeElements(c.elements),
    provenance: CHAIN_DSL_PROVENANCE,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Builds a FieldNode from common field properties.
 */
function buildFieldNode(
  name: string,
  type: TypeNode,
  required: boolean | undefined,
  annotations: AnnotationNode[],
  constraints: ConstraintNode[] = [],
): FieldNode {
  return {
    kind: "field",
    name,
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
 */
function buildObjectProperties(elements: readonly FormElement[]): ObjectProperty[] {
  const properties: ObjectProperty[] = [];

  for (const el of elements) {
    if (isField(el)) {
      const fieldNode = canonicalizeField(el);
      properties.push({
        name: fieldNode.name,
        type: fieldNode.type,
        optional: !fieldNode.required,
        constraints: fieldNode.constraints,
        annotations: fieldNode.annotations,
        provenance: CHAIN_DSL_PROVENANCE,
      });
    } else if (isGroup(el)) {
      // Groups inside object/array items contribute their fields by flattening
      properties.push(...buildObjectProperties(el.elements));
    } else if (isConditional(el)) {
      // Conditionals inside object/array items contribute their fields by flattening
      properties.push(...buildObjectProperties(el.elements));
    }
  }

  return properties;
}
