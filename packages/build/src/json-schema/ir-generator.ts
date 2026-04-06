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
} from "@formspec/core/internals";
import type { ResolvedMetadata } from "@formspec/core";
import type { ExtensionRegistry } from "../extensions/index.js";
import { getDisplayName, getSerializedName } from "../metadata/index.js";
import { assertNoSerializedNameCollisions } from "../metadata/collision-guards.js";

// =============================================================================
// OUTPUT TYPE
// =============================================================================

/**
 * A JSON Schema 2020-12 document, sub-schema, or keyword collection.
 *
 * This interface covers the subset of JSON Schema 2020-12 that this generator
 * emits, plus an index signature for custom `x-formspec-*` extension keywords.
 *
 * @public
 */
export interface JsonSchema2020 {
  /** Declared JSON Schema dialect URI for the document root. */
  $schema?: string;
  /** Reference to another schema location. */
  $ref?: string;
  /** Named reusable schema definitions keyed by definition name. */
  $defs?: Record<string, JsonSchema2020>;
  /** JSON Schema type keyword for the current node. */
  type?: string;
  /** Object properties keyed by property name. */
  properties?: Record<string, JsonSchema2020>;
  /** Property names that must be present on object values. */
  required?: string[];
  /** Item schema applied to array elements. */
  items?: JsonSchema2020;
  /** Whether, or how, additional object properties are allowed. */
  additionalProperties?: boolean | JsonSchema2020;
  /** Closed set of allowed scalar values. */
  enum?: readonly (string | number)[];
  /** Literal value the instance must equal. */
  const?: unknown;
  /** Schemas that must all validate successfully. */
  allOf?: readonly JsonSchema2020[];
  /** Schemas of which exactly one should validate successfully. */
  oneOf?: readonly JsonSchema2020[];
  /** Schemas of which at least one may validate successfully. */
  anyOf?: readonly JsonSchema2020[];
  // Constraints
  /** Inclusive numeric lower bound. */
  minimum?: number;
  /** Inclusive numeric upper bound. */
  maximum?: number;
  /** Exclusive numeric lower bound. */
  exclusiveMinimum?: number;
  /** Exclusive numeric upper bound. */
  exclusiveMaximum?: number;
  /** Required numeric step interval. */
  multipleOf?: number;
  /** Inclusive minimum string length. */
  minLength?: number;
  /** Inclusive maximum string length. */
  maxLength?: number;
  /** Inclusive minimum array length. */
  minItems?: number;
  /** Inclusive maximum array length. */
  maxItems?: number;
  /** Regular expression pattern applied to string values. */
  pattern?: string;
  /** Whether array elements must be unique. */
  uniqueItems?: boolean;
  /** Format hint for downstream validators and tooling. */
  format?: string;
  // Annotations
  /** Human-readable title for the schema node. */
  title?: string;
  /** Human-readable description for the schema node. */
  description?: string;
  /** Default value suggested for the schema node. */
  default?: unknown;
  /** Whether the schema node is deprecated. */
  deprecated?: boolean;
  // Extensions (open for vendor-prefixed keywords, e.g., x-formspec-*, x-stripe-*)
  // The vendor prefix is configurable (white-labelable).
  /** Additional vendor-prefixed extension keywords. */
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
  /** Logical type name to serialized `$defs` key. */
  readonly typeNameMap: Readonly<Record<string, string>>;
  /** Original type registry for reference lookups and property-name mapping. */
  readonly typeRegistry: Readonly<FormIR["typeRegistry"]>;
  /** Optional extension registry for resolving custom IR nodes. */
  readonly extensionRegistry: ExtensionRegistry | undefined;
  /** Vendor prefix passed through to extension toJsonSchema handlers. */
  readonly vendorPrefix: string;
}

/**
 * Options for generating JSON Schema from a canonical FormIR.
 *
 * @internal
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
    typeNameMap: {},
    typeRegistry: {},
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
 *
 * @internal
 */
export function generateJsonSchemaFromIR(
  ir: FormIR,
  options?: GenerateJsonSchemaFromIROptions
): JsonSchema2020 {
  assertNoSerializedNameCollisions(ir);

  const ctx = {
    ...makeContext(options),
    typeRegistry: ir.typeRegistry,
    typeNameMap: Object.fromEntries(
      Object.entries(ir.typeRegistry).map(([name, typeDef]) => [
        name,
        getSerializedName(name, typeDef.metadata),
      ])
    ),
  };

  // Seed $defs from the type registry so referenced types are available even if
  // the field tree traversal never visits them (e.g., unreferenced types added
  // by a TSDoc canonicalizer pass).
  for (const [name, typeDef] of Object.entries(ir.typeRegistry)) {
    const schemaName = ctx.typeNameMap[name] ?? name;
    ctx.defs[schemaName] = generateTypeNode(typeDef.type, ctx);
    applyResolvedMetadata(ctx.defs[schemaName], typeDef.metadata);
    if (typeDef.constraints && typeDef.constraints.length > 0) {
      applyConstraints(ctx.defs[schemaName], typeDef.constraints, ctx);
    }
    if (typeDef.annotations && typeDef.annotations.length > 0) {
      applyAnnotations(ctx.defs[schemaName], typeDef.annotations, ctx);
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
  applyResolvedMetadata(result, ir.metadata);

  if (ir.annotations && ir.annotations.length > 0) {
    applyAnnotations(result, ir.annotations, ctx);
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
        properties[getSerializedFieldName(element)] = generateFieldSchema(element, ctx);
        if (element.required) {
          required.push(getSerializedFieldName(element));
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

  applyResolvedMetadata(schema, field.metadata);
  applyAnnotations(schema, rootAnnotations, ctx);
  if (itemStringSchema !== undefined) {
    applyAnnotations(itemStringSchema, itemAnnotations, ctx);
  }

  // If no path-targeted constraints, return as-is.
  if (pathConstraints.length === 0) {
    return schema;
  }

  return applyPathTargetedConstraints(schema, pathConstraints, ctx, field.type);
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
  ctx: GeneratorContext,
  typeNode?: TypeNode
): JsonSchema2020 {
  // Array transparency: path-targeted constraints target the item type.
  if (schema.type === "array" && schema.items) {
    const referencedType = typeNode?.kind === "reference" ? resolveReferencedType(typeNode, ctx) : undefined;
    const nestedType =
      typeNode?.kind === "array"
        ? typeNode.items
        : referencedType?.kind === "array"
          ? referencedType.items
            : undefined
        ;
    schema.items = applyPathTargetedConstraints(schema.items, pathConstraints, ctx, nestedType);
    return schema;
  }

  const propertyOverrides = buildPropertyOverrides(pathConstraints, typeNode, ctx);
  const nullableValueBranch = getNullableUnionValueSchema(schema);

  if (nullableValueBranch !== undefined) {
    const updatedNullableValueBranch = applyPathTargetedConstraints(
      nullableValueBranch,
      pathConstraints,
      ctx,
      resolveTraversableTypeNode(typeNode, ctx)
    );
    if (schema.oneOf !== undefined) {
      schema.oneOf = schema.oneOf.map((branch) =>
        branch === nullableValueBranch ? updatedNullableValueBranch : branch
      );
    }
    return schema;
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
        mergeSchemaOverride(schema.properties[target], overrideSchema);
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
      return generateReferenceType(type, ctx);

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
  return {
    type:
      type.primitiveKind === "integer" || type.primitiveKind === "bigint"
        ? "integer"
        : type.primitiveKind,
  };
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
    const propertyName = getSerializedObjectPropertyName(prop);
    properties[propertyName] = generatePropertySchema(prop, ctx);
    if (!prop.optional) {
      required.push(propertyName);
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
  applyResolvedMetadata(schema, prop.metadata);
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
function generateReferenceType(type: ReferenceTypeNode, ctx: GeneratorContext): JsonSchema2020 {
  return { $ref: `#/$defs/${getSerializedTypeName(type.name, ctx)}` };
}

function getSerializedFieldName(
  field: Pick<FieldNode, "name" | "metadata">
): string {
  return getSerializedName(field.name, field.metadata);
}

function getSerializedObjectPropertyName(
  property: Pick<ObjectProperty, "name" | "metadata">
): string {
  return getSerializedName(property.name, property.metadata);
}

function getSerializedTypeName(logicalName: string, ctx: GeneratorContext): string {
  return ctx.typeNameMap[logicalName] ?? logicalName;
}

function applyResolvedMetadata(
  schema: JsonSchema2020,
  metadata: ResolvedMetadata | undefined
): void {
  const displayName = getDisplayName(metadata);
  if (displayName !== undefined) {
    schema.title = displayName;
  }
}

function resolveReferencedType(
  type: ReferenceTypeNode,
  ctx: GeneratorContext
): TypeNode | undefined {
  return ctx.typeRegistry[type.name]?.type;
}

function dereferenceTypeNode(typeNode: TypeNode | undefined, ctx: GeneratorContext): TypeNode | undefined {
  if (typeNode?.kind !== "reference") {
    return typeNode;
  }

  return resolveReferencedType(typeNode, ctx);
}

function unwrapNullableTypeNode(typeNode: TypeNode | undefined): TypeNode | undefined {
  if (typeNode?.kind !== "union" || !isNullableUnion(typeNode)) {
    return typeNode;
  }

  return typeNode.members.find(
    (member) => !(member.kind === "primitive" && member.primitiveKind === "null")
  );
}

function resolveTraversableTypeNode(
  typeNode: TypeNode | undefined,
  ctx: GeneratorContext
): TypeNode | undefined {
  const dereferenced = dereferenceTypeNode(typeNode, ctx);
  const unwrapped = unwrapNullableTypeNode(dereferenced);

  if (unwrapped !== dereferenced) {
    return resolveTraversableTypeNode(unwrapped, ctx);
  }

  return dereferenced;
}

function resolveSerializedPropertyName(
  logicalName: string,
  typeNode: TypeNode | undefined,
  ctx: GeneratorContext
): string {
  const effectiveType = resolveTraversableTypeNode(typeNode, ctx);
  if (effectiveType?.kind === "array") {
    return resolveSerializedPropertyName(logicalName, effectiveType.items, ctx);
  }

  if (effectiveType?.kind === "object") {
    const property = effectiveType.properties.find((candidate) => candidate.name === logicalName);
    return property === undefined ? logicalName : getSerializedObjectPropertyName(property);
  }

  return logicalName;
}

function resolveTargetTypeNode(
  logicalName: string,
  typeNode: TypeNode | undefined,
  ctx: GeneratorContext
): TypeNode | undefined {
  const effectiveType = resolveTraversableTypeNode(typeNode, ctx);
  if (effectiveType?.kind === "array") {
    return resolveTargetTypeNode(logicalName, effectiveType.items, ctx);
  }

  if (effectiveType?.kind !== "object") {
    return undefined;
  }

  return effectiveType.properties.find((candidate) => candidate.name === logicalName)?.type;
}

function buildPropertyOverrides(
  pathConstraints: readonly ConstraintNode[],
  typeNode: TypeNode | undefined,
  ctx: GeneratorContext
): Record<string, JsonSchema2020> {
  const byTarget = new Map<string, ConstraintNode[]>();

  for (const constraint of pathConstraints) {
    const target = constraint.path?.segments[0];
    if (!target) {
      continue;
    }
    const grouped = byTarget.get(target) ?? [];
    grouped.push(constraint);
    byTarget.set(target, grouped);
  }

  const overrides: Record<string, JsonSchema2020> = {};
  for (const [target, constraints] of byTarget) {
    overrides[resolveSerializedPropertyName(target, typeNode, ctx)] = buildPathOverrideSchema(
      constraints.map(stripLeadingPathSegment),
      resolveTargetTypeNode(target, typeNode, ctx),
      ctx
    );
  }

  return overrides;
}

function buildPathOverrideSchema(
  constraints: readonly ConstraintNode[],
  typeNode: TypeNode | undefined,
  ctx: GeneratorContext
): JsonSchema2020 {
  const schema: JsonSchema2020 = {};
  const directConstraints: ConstraintNode[] = [];
  const nestedConstraints: ConstraintNode[] = [];

  for (const constraint of constraints) {
    if (constraint.path === undefined || constraint.path.segments.length === 0) {
      directConstraints.push(constraint);
    } else {
      nestedConstraints.push(constraint);
    }
  }

  applyConstraints(schema, directConstraints, ctx);

  if (nestedConstraints.length === 0) {
    return schema;
  }

  const effectiveType = resolveTraversableTypeNode(typeNode, ctx);
  if (effectiveType?.kind === "array") {
    schema.items = buildPathOverrideSchema(nestedConstraints, effectiveType.items, ctx);
    return schema;
  }

  schema.properties = buildPropertyOverrides(nestedConstraints, effectiveType, ctx);
  return schema;
}

function mergeSchemaOverride(target: JsonSchema2020, override: JsonSchema2020): void {
  const nullableValueBranch = getNullableUnionValueSchema(target);
  if (nullableValueBranch !== undefined) {
    mergeSchemaOverride(nullableValueBranch, override);
    return;
  }

  if (override.properties !== undefined) {
    const mergedProperties = target.properties ?? {};
    for (const [name, propertyOverride] of Object.entries(override.properties)) {
      const existing = mergedProperties[name];
      if (existing === undefined) {
        mergedProperties[name] = propertyOverride;
      } else {
        mergeSchemaOverride(existing, propertyOverride);
      }
    }
    target.properties = mergedProperties;
  }

  if (override.items !== undefined) {
    if (target.items === undefined) {
      target.items = override.items;
    } else {
      mergeSchemaOverride(target.items, override.items);
    }
  }

  for (const [key, value] of Object.entries(override)) {
    if (key === "properties" || key === "items") {
      continue;
    }
    (target as Record<string, unknown>)[key] = value;
  }
}

function stripLeadingPathSegment(constraint: ConstraintNode): ConstraintNode {
  const segments = constraint.path?.segments;
  if (segments === undefined || segments.length === 0) {
    return constraint;
  }

  const [, ...rest] = segments;
  if (rest.length === 0) {
    const { path: _path, ...stripped } = constraint;
    return stripped;
  }

  return {
    ...constraint,
    path: { segments: rest },
  };
}

function getNullableUnionValueSchema(schema: JsonSchema2020): JsonSchema2020 | undefined {
  if (schema.oneOf?.length !== 2) {
    return undefined;
  }

  const valueSchema = schema.oneOf.find((branch) => branch.type !== "null");
  const nullSchema = schema.oneOf.find((branch) => branch.type === "null");
  return valueSchema !== undefined && nullSchema !== undefined ? valueSchema : undefined;
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
 * - `description`   → `description` (from summary text, spec 002 §2.3)
 * - `remarks`       → `x-<vendor>-remarks` (from @remarks, spec 003 §3.2)
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
        schema.title ??= annotation.value;
        break;

      case "description":
        schema.description = annotation.value;
        break;

      case "remarks":
        schema[`${ctx.vendorPrefix}-remarks` as `x-${string}`] = annotation.value;
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
          schema[`${ctx.vendorPrefix}-deprecation-description` as `x-${string}`] =
            annotation.message;
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

  assignVendorPrefixedExtensionKeywords(
    schema,
    registration.toJsonSchema(constraint.payload, ctx.vendorPrefix),
    ctx.vendorPrefix,
    `custom constraint "${constraint.constraintId}"`
  );
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

  assignVendorPrefixedExtensionKeywords(
    schema,
    registration.toJsonSchema(annotation.value, ctx.vendorPrefix),
    ctx.vendorPrefix,
    `custom annotation "${annotation.annotationId}"`
  );
}

function assignVendorPrefixedExtensionKeywords(
  schema: JsonSchema2020,
  extensionSchema: Record<string, unknown>,
  vendorPrefix: string,
  source: string
): void {
  for (const [key, value] of Object.entries(extensionSchema)) {
    if (!key.startsWith(`${vendorPrefix}-`)) {
      throw new Error(
        `Cannot apply ${source}: extension hooks may only emit "${vendorPrefix}-*" JSON Schema keywords`
      );
    }
    schema[key as `x-${string}`] = value;
  }
}
