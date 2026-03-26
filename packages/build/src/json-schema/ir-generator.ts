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
  RecordTypeNode,
  UnionTypeNode,
  ReferenceTypeNode,
  DynamicTypeNode,
  CustomTypeNode,
  ConstraintNode,
  AnnotationNode,
  ObjectProperty,
  JsonValue,
} from "@formspec/core";
import type { ExtensionRegistry } from "../extensions/index.js";

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
  additionalProperties?: boolean | JsonSchema2020;
  enum?: readonly (string | number)[];
  const?: JsonValue;
  allOf?: readonly JsonSchema2020[];
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
  format?: string;
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
  /** Optional extension registry for resolving custom IR nodes. */
  readonly extensionRegistry: ExtensionRegistry | undefined;
  /** Vendor prefix passed through to extension toJsonSchema handlers. */
  readonly vendorPrefix: string;
}

/**
 * Options for generating JSON Schema from a canonical FormIR.
 */
export interface GenerateJsonSchemaFromIROptions {
  /**
   * Registry used to resolve custom types, constraints, and annotations.
   *
   * JSON Schema generation throws when custom IR nodes are present without a
   * matching registration in this registry.
   */
  readonly extensionRegistry?: ExtensionRegistry | undefined;
  /**
   * Vendor prefix passed to extension `toJsonSchema` hooks.
   * @defaultValue "x-formspec"
   */
  readonly vendorPrefix?: string | undefined;
}

function makeContext(options?: GenerateJsonSchemaFromIROptions): GeneratorContext {
  const vendorPrefix = options?.vendorPrefix ?? "x-formspec";
  if (!vendorPrefix.startsWith("x-")) {
    throw new Error(
      `Invalid vendorPrefix "${vendorPrefix}". Extension JSON Schema keywords must start with "x-".`
    );
  }

  return {
    defs: {},
    extensionRegistry: options?.extensionRegistry,
    vendorPrefix,
  };
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
 * Advanced API — most consumers should use `generateJsonSchema()` or
 * `buildFormSchemas()`, which canonicalize form definitions automatically.
 * Callers of this function are responsible for providing pre-canonicalized IR.
 *
 * @param ir - The canonical FormIR produced by a canonicalizer
 * @returns A plain JSON-serializable JSON Schema 2020-12 object
 */
export function generateJsonSchemaFromIR(
  ir: FormIR,
  options?: GenerateJsonSchemaFromIROptions
): JsonSchema2020 {
  const ctx = makeContext(options);

  // Seed $defs from the type registry so referenced types are available even if
  // the field tree traversal never visits them (e.g., unreferenced types added
  // by a TSDoc canonicalizer pass).
  for (const [name, typeDef] of Object.entries(ir.typeRegistry)) {
    ctx.defs[name] = generateTypeNode(typeDef.type, ctx);
    if (typeDef.annotations && typeDef.annotations.length > 0) {
      applyAnnotations(ctx.defs[name], typeDef.annotations);
    }
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

  if (ir.annotations && ir.annotations.length > 0) {
    applyAnnotations(result, ir.annotations);
  }

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
  const itemStringSchema =
    schema.type === "array" && schema.items?.type === "string" ? schema.items : undefined;

  // Partition constraints into direct (no path) and path-targeted.
  const directConstraints: ConstraintNode[] = [];
  const itemConstraints: ConstraintNode[] = [];
  const pathConstraints: ConstraintNode[] = [];
  for (const c of field.constraints) {
    if (c.path) {
      pathConstraints.push(c);
    } else if (itemStringSchema !== undefined && isStringItemConstraint(c)) {
      itemConstraints.push(c);
    } else {
      directConstraints.push(c);
    }
  }

  // Apply direct constraints. multipleOf:1 on a number type is a special case:
  // it promotes the type to "integer" and removes the multipleOf keyword.
  applyConstraints(schema, directConstraints, ctx);

  if (itemStringSchema !== undefined) {
    applyConstraints(itemStringSchema, itemConstraints, ctx);
  }

  // Apply annotations (title, description, default, deprecated, etc.).
  const rootAnnotations: AnnotationNode[] = [];
  const itemAnnotations: AnnotationNode[] = [];
  for (const annotation of field.annotations) {
    if (itemStringSchema !== undefined && annotation.annotationKind === "format") {
      itemAnnotations.push(annotation);
    } else {
      rootAnnotations.push(annotation);
    }
  }

  applyAnnotations(schema, rootAnnotations, ctx);
  if (itemStringSchema !== undefined) {
    applyAnnotations(itemStringSchema, itemAnnotations, ctx);
  }

  // If no path-targeted constraints, return as-is.
  if (pathConstraints.length === 0) {
    return schema;
  }

  return applyPathTargetedConstraints(schema, pathConstraints, ctx);
}

/**
 * Returns true if a constraint should be applied to the `items` schema of a
 * primitive `string[]` rather than the array itself.
 *
 * `@const` is intentionally excluded: arrays cannot carry primitive const
 * constraints in FormSpec, so `@const` on `string[]` remains a validation
 * error instead of targeting the item schema.
 */
function isStringItemConstraint(constraint: ConstraintNode): boolean {
  switch (constraint.constraintKind) {
    case "minLength":
    case "maxLength":
    case "pattern":
      return true;
    default:
      return false;
  }
}

/**
 * Applies path-targeted constraints to a schema via allOf composition.
 *
 * For $ref schemas: wraps in allOf with property overrides.
 * For inline object schemas: applies directly to nested properties.
 * For array schemas: applies path constraints to the items sub-schema.
 */
function applyPathTargetedConstraints(
  schema: JsonSchema2020,
  pathConstraints: readonly ConstraintNode[],
  ctx: GeneratorContext
): JsonSchema2020 {
  // Array transparency: path-targeted constraints target the item type.
  if (schema.type === "array" && schema.items) {
    schema.items = applyPathTargetedConstraints(schema.items, pathConstraints, ctx);
    return schema;
  }

  // Group path constraints by target field name (first path segment).
  // Callers guarantee all entries have a defined `path` (filtered upstream).
  const byTarget = new Map<string, ConstraintNode[]>();
  for (const c of pathConstraints) {
    const target = c.path?.segments[0];
    if (!target) continue;
    const group = byTarget.get(target) ?? [];
    group.push(c);
    byTarget.set(target, group);
  }

  // Build the property overrides object.
  const propertyOverrides: Record<string, JsonSchema2020> = {};
  for (const [target, constraints] of byTarget) {
    const subSchema: JsonSchema2020 = {};
    applyConstraints(subSchema, constraints, ctx);
    propertyOverrides[target] = subSchema;
  }

  // $ref schema: wrap in allOf to preserve $ref semantics while adding overrides.
  if (schema.$ref) {
    const { $ref, ...rest } = schema;
    const refPart: JsonSchema2020 = { $ref };
    const overridePart: JsonSchema2020 = {
      properties: propertyOverrides,
      ...rest,
    };
    return { allOf: [refPart, overridePart] };
  }

  // Inline object schema: merge property overrides directly where possible.
  if (schema.type === "object" && schema.properties) {
    const missingOverrides: Record<string, JsonSchema2020> = {};

    for (const [target, overrideSchema] of Object.entries(propertyOverrides)) {
      if (schema.properties[target]) {
        Object.assign(schema.properties[target], overrideSchema);
      } else {
        // Do not introduce new properties directly; compose via allOf instead
        // to preserve additionalProperties semantics on the base object.
        missingOverrides[target] = overrideSchema;
      }
    }

    if (Object.keys(missingOverrides).length === 0) {
      return schema;
    }

    return {
      allOf: [schema, { properties: missingOverrides }],
    };
  }

  // allOf schema (already composed): add property overrides as another member.
  if (schema.allOf) {
    schema.allOf = [...schema.allOf, { properties: propertyOverrides }];
    return schema;
  }

  // Fallback: for non-object/non-$ref schemas, path-targeted constraints do not
  // apply in a meaningful way. Return the original schema unchanged and rely
  // on validation diagnostics to surface misuse of path-based constraints.
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

    case "record":
      return generateRecordType(type, ctx);

    case "union":
      return generateUnionType(type, ctx);

    case "reference":
      return generateReferenceType(type);

    case "dynamic":
      return generateDynamicType(type);

    case "custom":
      return generateCustomType(type, ctx);

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
 * `additionalProperties` is emitted only when the IR explicitly closes the
 * object. Ordinary static object types now canonicalize to
 * `additionalProperties: true`, which omits the keyword per spec 003 §2.5.
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
    schema.additionalProperties = false;
  }

  return schema;
}

/**
 * Generates JSON Schema for a record (dictionary) type per spec 003 §2.5.
 *
 * `Record<string, T>` and `{ [k: string]: T }` both emit:
 * `{ "type": "object", "additionalProperties": <T schema> }`
 *
 * No `properties` key is emitted — the record has no named properties.
 */
function generateRecordType(type: RecordTypeNode, ctx: GeneratorContext): JsonSchema2020 {
  return {
    type: "object",
    additionalProperties: generateTypeNode(type.valueType, ctx),
  };
}

/**
 * Generates a schema for an ObjectProperty, applying its use-site constraints
 * and annotations (per the JSON Schema vocabulary spec §5.4 — inline allOf at use site).
 */
function generatePropertySchema(prop: ObjectProperty, ctx: GeneratorContext): JsonSchema2020 {
  const schema = generateTypeNode(prop.type, ctx);
  applyConstraints(schema, prop.constraints, ctx);
  applyAnnotations(schema, prop.annotations, ctx);
  return schema;
}

/**
 * Generates JSON Schema for a union type.
 *
 * Union handling strategy (per spec 003):
 * - Boolean shorthand: `true | false` → `{ type: "boolean" }` (not oneOf/anyOf)
 * - Nullable unions: `T | null` → `{ "oneOf": [<T schema>, { "type": "null" }] }` (§2.3)
 * - All other unions → `anyOf` (members may overlap; discriminated union
 *   detection is deferred to a future phase per design doc 003 §7.4)
 */
function generateUnionType(type: UnionTypeNode, ctx: GeneratorContext): JsonSchema2020 {
  // Boolean shorthand: union of true-literal and false-literal → type: "boolean"
  if (isBooleanUnion(type)) {
    return { type: "boolean" };
  }

  // Nullable union: `T | null` → oneOf per spec 003 §2.3.
  // A nullable union is any union where exactly one member is the null primitive.
  if (isNullableUnion(type)) {
    return {
      oneOf: type.members.map((m) => generateTypeNode(m, ctx)),
    };
  }

  // Default: anyOf for non-discriminated object unions (spec 003 §7.4).
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
 * Returns true if the union is a nullable wrapper union (`T | null` for any T).
 *
 * A nullable union is a two-member union where exactly one member is the `null`
 * primitive type and the other member is any non-null type.
 * Per spec 003 §2.3, nullable unions map to `oneOf` (not `anyOf`).
 */
function isNullableUnion(type: UnionTypeNode): boolean {
  if (type.members.length !== 2) return false;
  const nullCount = type.members.filter(
    (m) => m.kind === "primitive" && m.primitiveKind === "null"
  ).length;
  return nullCount === 1;
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
 * Path-targeted constraints are handled separately by `applyPathTargetedConstraints`.
 */
function applyConstraints(
  schema: JsonSchema2020,
  constraints: readonly ConstraintNode[],
  ctx: GeneratorContext
): void {
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

      case "const":
        schema.const = constraint.value;
        break;

      case "allowedMembers":
        // EnumMemberConstraintNode — not yet emitted to JSON Schema (Phase 6 validation).
        break;

      case "custom":
        applyCustomConstraint(schema, constraint, ctx);
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
 * - `format`        → `format`
 *
 * UI-only annotations (`placeholder`, `formatHint`) are silently ignored here —
 * they belong in the UI Schema, not the data schema.
 */
function applyAnnotations(
  schema: JsonSchema2020,
  annotations: readonly AnnotationNode[],
  ctx: GeneratorContext
): void {
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

      case "format":
        schema.format = annotation.value;
        break;

      case "deprecated":
        schema.deprecated = true;
        if (annotation.message !== undefined && annotation.message !== "") {
          schema["x-formspec-deprecation-description"] = annotation.message;
        }
        break;

      case "placeholder":
        // UI-only — belongs in UI Schema, not emitted here.
        break;

      case "formatHint":
        // UI-only — belongs in UI Schema, not emitted here.
        break;

      case "custom":
        applyCustomAnnotation(schema, annotation, ctx);
        break;

      default: {
        // TypeScript exhaustiveness guard.
        const _exhaustive: never = annotation;
        void _exhaustive;
      }
    }
  }
}

function generateCustomType(type: CustomTypeNode, ctx: GeneratorContext): JsonSchema2020 {
  const registration = ctx.extensionRegistry?.findType(type.typeId);
  if (registration === undefined) {
    throw new Error(
      `Cannot generate JSON Schema for custom type "${type.typeId}" without a matching extension registration`
    );
  }

  // Trust boundary: extensions are responsible for returning valid JSON Schema.
  // Core only depends on Record<string, unknown> here, so we cast at the edge.
  return registration.toJsonSchema(type.payload, ctx.vendorPrefix) as JsonSchema2020;
}

function applyCustomConstraint(
  schema: JsonSchema2020,
  constraint: Extract<ConstraintNode, { constraintKind: "custom" }>,
  ctx: GeneratorContext
): void {
  const registration = ctx.extensionRegistry?.findConstraint(constraint.constraintId);
  if (registration === undefined) {
    throw new Error(
      `Cannot generate JSON Schema for custom constraint "${constraint.constraintId}" without a matching extension registration`
    );
  }

  // Trust boundary: extension hooks are expected to return valid JSON Schema
  // keywords, typically vendor-prefixed extension annotations.
  Object.assign(schema, registration.toJsonSchema(constraint.payload, ctx.vendorPrefix));
}

function applyCustomAnnotation(
  schema: JsonSchema2020,
  annotation: Extract<AnnotationNode, { annotationKind: "custom" }>,
  ctx: GeneratorContext
): void {
  const registration = ctx.extensionRegistry?.findAnnotation(annotation.annotationId);
  if (registration === undefined) {
    throw new Error(
      `Cannot generate JSON Schema for custom annotation "${annotation.annotationId}" without a matching extension registration`
    );
  }

  if (registration.toJsonSchema === undefined) {
    return;
  }

  // Trust boundary: extension hooks are expected to return valid JSON Schema
  // keywords, typically vendor-prefixed extension annotations.
  Object.assign(schema, registration.toJsonSchema(annotation.value, ctx.vendorPrefix));
}
