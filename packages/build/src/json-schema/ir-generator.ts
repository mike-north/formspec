/**
 * JSON Schema 2020-12 generator that consumes the canonical FormIR.
 *
 * This generator is a pure function of the IR. It never consults the TypeScript
 * AST or surface syntax directly — only the IR (per the JSON Schema vocabulary spec §1.2).
 *
 * @see https://json-schema.org/draft/2020-12/schema
 * @see https://json-schema.org/draft/2020-12/schema
 */

import type {
  FormIR,
  FormIRElement,
  FieldNode,
  TypeNode,
  PrimitiveTypeNode,
  EnumTypeNode,
  ArrayTypeNode,
  ObjectTypeNode,
  UnionTypeNode,
  ReferenceTypeNode,
  DynamicTypeNode,
  CustomTypeNode,
  ConstraintNode,
  AnnotationNode,
  ObjectProperty,
} from "@formspec/core";

// =============================================================================
// OUTPUT TYPE
// =============================================================================

/**
 * A JSON Schema 2020-12 document, sub-schema, or keyword collection.
 *
 * This interface covers the subset of JSON Schema 2020-12 that this generator
 * emits, plus an index signature for custom `x-formspec-*` extension keywords.
 */
export interface JsonSchema2020 {
  $schema?: string;
  $ref?: string;
  $defs?: Record<string, JsonSchema2020>;
  type?: string;
  properties?: Record<string, JsonSchema2020>;
  required?: string[];
  items?: JsonSchema2020;
  additionalProperties?: boolean;
  enum?: readonly (string | number)[];
  const?: string | number | boolean | null;
  oneOf?: readonly JsonSchema2020[];
  anyOf?: readonly JsonSchema2020[];
  // Constraints
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  uniqueItems?: boolean;
  // Annotations
  title?: string;
  description?: string;
  default?: unknown;
  deprecated?: boolean;
  // Extensions (open for vendor-prefixed keywords, e.g., x-formspec-*, x-stripe-*)
  // The vendor prefix is configurable (white-labelable).
  [key: `x-${string}`]: unknown;
}

// =============================================================================
// CONTEXT
// =============================================================================

/**
 * Mutable accumulator passed through the generation traversal.
 *
 * Using a context object rather than return-value threading keeps the
 * recursive generators simple and avoids repeated object spreading.
 */
interface GeneratorContext {
  /** Named type schemas collected during traversal, keyed by reference name. */
  readonly defs: Record<string, JsonSchema2020>;
}

function makeContext(): GeneratorContext {
  return { defs: {} };
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Generates a JSON Schema 2020-12 object from a canonical FormIR.
 *
 * Groups and conditionals are flattened — they influence UI layout but do not
 * affect the data schema. All fields appear at the level they would occupy in
 * the output data.
 *
 * Named types in the `typeRegistry` are emitted as `$defs` entries and
 * referenced via `$ref` (per PP7 — high-fidelity output).
 *
 * @example
 * ```typescript
 * import { canonicalizeDSL } from "./canonicalize/index.js";
 * import { generateJsonSchemaFromIR } from "./json-schema/ir-generator.js";
 * import { formspec, field } from "@formspec/dsl";
 *
 * const form = formspec(
 *   field.text("name", { label: "Name", required: true }),
 *   field.number("age", { min: 0 }),
 * );
 * const ir = canonicalizeDSL(form);
 * const schema = generateJsonSchemaFromIR(ir);
 * // {
 * //   $schema: "https://json-schema.org/draft/2020-12/schema",
 * //   type: "object",
 * //   properties: {
 * //     name: { type: "string", title: "Name" },
 * //     age:  { type: "number", minimum: 0 }
 * //   },
 * //   required: ["name"]
 * // }
 * ```
 *
 * @param ir - The canonical FormIR produced by a canonicalizer
 * @returns A plain JSON-serializable JSON Schema 2020-12 object
 */
export function generateJsonSchemaFromIR(ir: FormIR): JsonSchema2020 {
  const ctx = makeContext();

  // Seed $defs from the type registry so referenced types are available even if
  // the field tree traversal never visits them (e.g., unreferenced types added
  // by a TSDoc canonicalizer pass).
  for (const [name, typeDef] of Object.entries(ir.typeRegistry)) {
    ctx.defs[name] = generateTypeNode(typeDef.type, ctx);
  }

  const properties: Record<string, JsonSchema2020> = {};
  const required: string[] = [];

  collectFields(ir.elements, properties, required, ctx);

  // Deduplicate required (same field can appear across conditional branches).
  const uniqueRequired = [...new Set(required)];

  const result: JsonSchema2020 = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties,
    ...(uniqueRequired.length > 0 && { required: uniqueRequired }),
  };

  if (Object.keys(ctx.defs).length > 0) {
    result.$defs = ctx.defs;
  }

  return result;
}

// =============================================================================
// ELEMENT TRAVERSAL
// =============================================================================

/**
 * Recursively visits all IR elements, collecting field schemas and required names.
 *
 * Groups and conditionals are transparent to the schema — their children are
 * lifted to the enclosing level (per the JSON Schema vocabulary spec §1.2).
 */
function collectFields(
  elements: readonly FormIRElement[],
  properties: Record<string, JsonSchema2020>,
  required: string[],
  ctx: GeneratorContext
): void {
  for (const element of elements) {
    switch (element.kind) {
      case "field":
        properties[element.name] = generateFieldSchema(element, ctx);
        if (element.required) {
          required.push(element.name);
        }
        break;

      case "group":
        // Groups are UI-only; flatten children into the enclosing schema.
        collectFields(element.elements, properties, required, ctx);
        break;

      case "conditional":
        // Conditional visibility is UI-only; all fields remain in the schema.
        collectFields(element.elements, properties, required, ctx);
        break;

      default: {
        const _exhaustive: never = element;
        void _exhaustive;
      }
    }
  }
}

// =============================================================================
// FIELD SCHEMA GENERATION
// =============================================================================

/**
 * Generates the JSON Schema sub-schema for a single FieldNode.
 */
function generateFieldSchema(field: FieldNode, ctx: GeneratorContext): JsonSchema2020 {
  const schema = generateTypeNode(field.type, ctx);

  // Apply constraints. multipleOf:1 on a number type is a special case: it
  // promotes the type to "integer" and removes the multipleOf keyword.
  applyConstraints(schema, field.constraints);

  // Apply annotations (title, description, default, deprecated, etc.).
  applyAnnotations(schema, field.annotations);

  return schema;
}

// =============================================================================
// TYPE NODE GENERATION
// =============================================================================

/**
 * Converts a TypeNode to a JSON Schema sub-schema.
 *
 * This function is intentionally exhaustive — all TypeNode variants are handled.
 * TypeScript's exhaustiveness check via the default branch ensures new variants
 * added to the IR are caught at compile time.
 */
function generateTypeNode(type: TypeNode, ctx: GeneratorContext): JsonSchema2020 {
  switch (type.kind) {
    case "primitive":
      return generatePrimitiveType(type);

    case "enum":
      return generateEnumType(type);

    case "array":
      return generateArrayType(type, ctx);

    case "object":
      return generateObjectType(type, ctx);

    case "union":
      return generateUnionType(type, ctx);

    case "reference":
      return generateReferenceType(type);

    case "dynamic":
      return generateDynamicType(type);

    case "custom":
      return generateCustomType(type);

    default: {
      // TypeScript exhaustiveness guard.
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * Maps primitive IR types to JSON Schema type keywords.
 *
 * Note: `integer` is NOT a primitive kind in the IR. Integer semantics are
 * expressed via a `multipleOf: 1` constraint on a number type; `applyConstraints`
 * handles the promotion (per the JSON Schema vocabulary spec §2.1).
 */
function generatePrimitiveType(type: PrimitiveTypeNode): JsonSchema2020 {
  return { type: type.primitiveKind };
}

/**
 * Generates JSON Schema for a static enum type.
 *
 * When any member has a displayName, the output uses the `oneOf` form with
 * per-member `const`/`title` entries (per the JSON Schema vocabulary spec §2.3). Otherwise the
 * flat `enum` keyword is used (simpler, equally valid).
 */
function generateEnumType(type: EnumTypeNode): JsonSchema2020 {
  const hasDisplayNames = type.members.some((m) => m.displayName !== undefined);

  if (hasDisplayNames) {
    return {
      oneOf: type.members.map((m) => {
        const entry: JsonSchema2020 = { const: m.value };
        if (m.displayName !== undefined) {
          entry.title = m.displayName;
        }
        return entry;
      }),
    };
  }

  return { enum: type.members.map((m) => m.value) };
}

/**
 * Generates JSON Schema for an array type.
 * Per 2020-12, `items` is a single schema (not an array); tuple types use
 * `prefixItems` + `items: false`.
 */
function generateArrayType(type: ArrayTypeNode, ctx: GeneratorContext): JsonSchema2020 {
  return {
    type: "array",
    items: generateTypeNode(type.items, ctx),
  };
}

/**
 * Generates JSON Schema for an object type.
 *
 * `additionalProperties` is only emitted when the IR explicitly disallows extra
 * properties. The default per the JSON Schema vocabulary spec §2.5 is to omit it (allow policy).
 */
function generateObjectType(type: ObjectTypeNode, ctx: GeneratorContext): JsonSchema2020 {
  const properties: Record<string, JsonSchema2020> = {};
  const required: string[] = [];

  for (const prop of type.properties) {
    properties[prop.name] = generatePropertySchema(prop, ctx);
    if (!prop.optional) {
      required.push(prop.name);
    }
  }

  const schema: JsonSchema2020 = { type: "object", properties };

  if (required.length > 0) {
    schema.required = required;
  }

  if (!type.additionalProperties) {
    // IR default is false (closed objects). Emit explicitly when disallowed.
    schema.additionalProperties = false;
  }

  return schema;
}

/**
 * Generates a schema for an ObjectProperty, applying its use-site constraints
 * and annotations (per the JSON Schema vocabulary spec §5.4 — inline allOf at use site).
 */
function generatePropertySchema(prop: ObjectProperty, ctx: GeneratorContext): JsonSchema2020 {
  const schema = generateTypeNode(prop.type, ctx);
  applyConstraints(schema, prop.constraints);
  applyAnnotations(schema, prop.annotations);
  return schema;
}

/**
 * Generates JSON Schema for a union type.
 *
 * Union handling strategy:
 * - Boolean shorthand: `true | false` → `{ type: "boolean" }` (not anyOf)
 * - All other unions → `anyOf` (members may overlap; discriminated union
 *   detection is deferred to a future phase per design doc 003 §7.4)
 */
function generateUnionType(type: UnionTypeNode, ctx: GeneratorContext): JsonSchema2020 {
  // Boolean shorthand: union of true-literal and false-literal → type: "boolean"
  if (isBooleanUnion(type)) {
    return { type: "boolean" };
  }

  // Default: anyOf for all non-boolean unions.
  // Discriminated union detection (shared required property with distinct consts)
  // is deferred to a future phase.
  return {
    anyOf: type.members.map((m) => generateTypeNode(m, ctx)),
  };
}

/**
 * Returns true if the union is `true | false` (boolean shorthand).
 */
function isBooleanUnion(type: UnionTypeNode): boolean {
  if (type.members.length !== 2) return false;
  const kinds = type.members.map((m) => m.kind);
  // Both must be primitives; check if both are "boolean" primitives.
  // The IR currently does not have a boolean literal node, so boolean union
  // is represented as two primitive boolean members.
  return (
    kinds.every((k) => k === "primitive") &&
    type.members.every((m) => m.kind === "primitive" && m.primitiveKind === "boolean")
  );
}

/**
 * Generates JSON Schema for a reference type.
 *
 * The referenced type's schema is stored in `$defs` (seeded from the type
 * registry before traversal begins). The reference simply emits a `$ref`.
 */
function generateReferenceType(type: ReferenceTypeNode): JsonSchema2020 {
  return { $ref: `#/$defs/${type.name}` };
}

/**
 * Generates JSON Schema for a dynamic type (runtime-resolved enum or schema).
 *
 * Dynamic enums emit `x-formspec-source` and optionally `x-formspec-params`.
 * Dynamic schemas emit `x-formspec-schemaSource` with `additionalProperties: true`
 * since the actual schema is determined at runtime (per the JSON Schema vocabulary spec §3.2).
 */
function generateDynamicType(type: DynamicTypeNode): JsonSchema2020 {
  if (type.dynamicKind === "enum") {
    const schema: JsonSchema2020 = {
      type: "string",
      "x-formspec-source": type.sourceKey,
    };
    if (type.parameterFields.length > 0) {
      schema["x-formspec-params"] = [...type.parameterFields];
    }
    return schema;
  }

  // dynamicKind === "schema"
  return {
    type: "object",
    additionalProperties: true,
    "x-formspec-schemaSource": type.sourceKey,
  };
}

/**
 * CustomTypeNode is a placeholder for Phase 8 extensions.
 * Emits a minimal passthrough object type until the extension API is implemented.
 */
function generateCustomType(_type: CustomTypeNode): JsonSchema2020 {
  return { type: "object" };
}

// =============================================================================
// CONSTRAINT APPLICATION
// =============================================================================

/**
 * Applies constraint nodes onto an existing JSON Schema object (mutates in place).
 *
 * All callers pass freshly-created objects so there is no aliasing risk.
 *
 * Special rule (per the JSON Schema vocabulary spec §2.1): `multipleOf: 1` on a `"number"` type
 * promotes to `"integer"` and suppresses the `multipleOf` keyword (integer is a
 * subtype of number; expressing it via multipleOf:1 is redundant).
 *
 * Path-targeted constraints (e.g., `@minimum :value 0`) are emitted at the field
 * level here; full sub-field targeting via allOf composition is a Phase 4 concern.
 */
function applyConstraints(schema: JsonSchema2020, constraints: readonly ConstraintNode[]): void {
  for (const constraint of constraints) {
    switch (constraint.constraintKind) {
      case "minimum":
        schema.minimum = constraint.value;
        break;

      case "maximum":
        schema.maximum = constraint.value;
        break;

      case "exclusiveMinimum":
        schema.exclusiveMinimum = constraint.value;
        break;

      case "exclusiveMaximum":
        schema.exclusiveMaximum = constraint.value;
        break;

      case "multipleOf": {
        const { value } = constraint;
        if (value === 1 && schema.type === "number") {
          // Promote number → integer; omit the multipleOf keyword (redundant).
          schema.type = "integer";
        } else {
          schema.multipleOf = value;
        }
        break;
      }

      case "minLength":
        schema.minLength = constraint.value;
        break;

      case "maxLength":
        schema.maxLength = constraint.value;
        break;

      case "minItems":
        schema.minItems = constraint.value;
        break;

      case "maxItems":
        schema.maxItems = constraint.value;
        break;

      case "pattern":
        schema.pattern = constraint.pattern;
        break;

      case "uniqueItems":
        schema.uniqueItems = constraint.value;
        break;

      case "allowedMembers":
        // EnumMemberConstraintNode — not yet emitted to JSON Schema (Phase 6 validation).
        break;

      case "custom":
        // CustomConstraintNode — handled by Phase 8 extensions.
        break;

      default: {
        // TypeScript exhaustiveness guard.
        const _exhaustive: never = constraint;
        void _exhaustive;
      }
    }
  }
}

// =============================================================================
// ANNOTATION APPLICATION
// =============================================================================

/**
 * Applies annotation nodes onto an existing JSON Schema object (mutates in place).
 *
 * Mapping per the JSON Schema vocabulary spec §2.8:
 * - `displayName`   → `title`
 * - `description`   → `description`
 * - `defaultValue`  → `default`
 * - `deprecated`    → `deprecated: true` (2020-12 standard annotation)
 *
 * UI-only annotations (`placeholder`, `formatHint`) are silently ignored here —
 * they belong in the UI Schema, not the data schema.
 */
function applyAnnotations(schema: JsonSchema2020, annotations: readonly AnnotationNode[]): void {
  for (const annotation of annotations) {
    switch (annotation.annotationKind) {
      case "displayName":
        schema.title = annotation.value;
        break;

      case "description":
        schema.description = annotation.value;
        break;

      case "defaultValue":
        schema.default = annotation.value;
        break;

      case "deprecated":
        schema.deprecated = true;
        break;

      case "placeholder":
        // UI-only — belongs in UI Schema, not emitted here.
        break;

      case "formatHint":
        // UI-only — belongs in UI Schema, not emitted here.
        break;

      case "custom":
        // CustomAnnotationNode — handled by Phase 8 extensions.
        break;

      default: {
        // TypeScript exhaustiveness guard.
        const _exhaustive: never = annotation;
        void _exhaustive;
      }
    }
  }
}
