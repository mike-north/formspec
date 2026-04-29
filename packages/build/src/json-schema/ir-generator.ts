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
import type { FormSpecSerializationConfig } from "@formspec/config";
import type { ExtensionRegistry } from "../extensions/index.js";
import { getDisplayName, getSerializedName } from "../metadata/index.js";
import { assertNoSerializedNameCollisions } from "../metadata/collision-guards.js";
import { emitKey } from "../serialization/emit-key.js";
import type { SerializationContext } from "../serialization/output-writer.js";
import { isWellFormedVendorPrefix } from "../serialization/vendor-key-format.js";

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
interface GeneratorContext extends SerializationContext {
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
  /** Selected JSON Schema representation for enum-like values. */
  readonly enumSerialization: "enum" | "oneOf" | "smart-size";
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
  /**
   * JSON Schema representation to use for static enums.
   * @defaultValue "enum"
   */
  readonly enumSerialization?: "enum" | "oneOf" | "smart-size" | undefined;
  /** Forward-looking serialization configuration for vocabulary and dialect transport. */
  readonly serialization?: FormSpecSerializationConfig | undefined;
}

/**
 * Normalizes enum serialization input so JavaScript callers still get a
 * runtime validation error for unsupported values.
 */
function parseEnumSerialization(value: unknown): GeneratorContext["enumSerialization"] {
  switch (value) {
    case undefined:
    case "enum":
      return "enum";
    case "oneOf":
      return "oneOf";
    case "smart-size":
      return "smart-size";
    default:
      throw new Error(
        `Invalid enumSerialization "${String(value)}". Expected "enum", "oneOf", or "smart-size".`
      );
  }
}

function makeContext(options?: GenerateJsonSchemaFromIROptions): GeneratorContext {
  const vendorPrefix = options?.vendorPrefix ?? "x-formspec";
  const enumSerialization = parseEnumSerialization(options?.enumSerialization);
  if (!isWellFormedVendorPrefix(vendorPrefix)) {
    throw new Error(
      `Invalid vendorPrefix "${vendorPrefix}". Extension JSON Schema vendor prefixes must match /^x-[a-z0-9]+$/.`
    );
  }

  return {
    defs: {},
    typeNameMap: {},
    typeRegistry: {},
    extensionRegistry: options?.extensionRegistry,
    vendorPrefix,
    defaultTransport: "extension",
    serialization: options?.serialization,
    enumSerialization,
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
      applyAnnotations(ctx.defs[schemaName], typeDef.annotations, ctx, typeDef.type);
    }
  }

  const properties: Record<string, JsonSchema2020> = {};
  const required: string[] = [];

  collectFields(ir.elements, properties, required, ctx);

  // Deduplicate and sort required names so output stays stable across IR traversal changes.
  const uniqueRequired = [...new Set(required)].sort();

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
  applyAnnotations(schema, rootAnnotations, ctx, field.type);
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
 * Applies path-targeted constraints to a schema using JSON Schema 2020-12
 * sibling keywords wherever possible.
 *
 * For $ref schemas: merges property overrides as sibling keywords alongside
 * `$ref`. JSON Schema 2020-12 §10.2.1 allows keywords to appear next to
 * `$ref`; the draft-07 restriction that required `allOf` composition no
 * longer applies. Sibling emission preserves `$defs` deduplication and
 * produces leaner output downstream renderers can consume directly (#364).
 *
 * For inline object schemas: merges property overrides flat into
 * `properties`. Declaring the key in `properties` legitimizes it regardless
 * of `additionalProperties`, so no `allOf` wrapper is needed even when the
 * base is closed (#366, #382 Site 1).
 *
 * For already-composed `allOf` schemas: flatten to siblings when the
 * composition is expressible that way under 2020-12; otherwise append the
 * override as another `allOf` member (#382 Site 2).
 *
 * For array schemas: recurse into the `items` sub-schema.
 *
 * @see https://github.com/mike-north/formspec/issues/364
 * @see https://github.com/mike-north/formspec/issues/366
 * @see https://github.com/mike-north/formspec/issues/382
 * @see https://json-schema.org/draft/2020-12/json-schema-core — §10.2.1 sibling keywords
 */
function applyPathTargetedConstraints(
  schema: JsonSchema2020,
  pathConstraints: readonly ConstraintNode[],
  ctx: GeneratorContext,
  typeNode?: TypeNode
): JsonSchema2020 {
  // Array transparency: path-targeted constraints target the item type.
  if (schema.type === "array" && schema.items) {
    const referencedType =
      typeNode?.kind === "reference" ? resolveReferencedType(typeNode, ctx) : undefined;
    const nestedType =
      typeNode?.kind === "array"
        ? typeNode.items
        : referencedType?.kind === "array"
          ? referencedType.items
          : undefined;
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

  // $ref schema: add property overrides as sibling keywords alongside $ref.
  // JSON Schema 2020-12 §10.2.1 explicitly permits sibling keywords next to
  // $ref, unlike draft-07 where $ref caused all siblings to be ignored. Using
  // sibling keywords avoids unnecessary allOf composition and preserves $defs
  // deduplication. (Fixes #364.)
  //
  // Invariant: upstream reference resolution produces `$ref` schemas that do
  // not carry their own `properties` key, so this spread-then-overwrite is
  // safe today. If that ever changes, the override must still win — merge
  // explicitly via `properties: { ...schema.properties, ...propertyOverrides }`.
  if (schema.$ref) {
    return {
      ...schema,
      properties: propertyOverrides,
    };
  }

  // Inline object schema: merge property overrides directly into siblings.
  //
  // Previously missing-property overrides were composed via `allOf` to keep
  // `additionalProperties` semantics intact. JSON Schema 2020-12 (§10.2.1)
  // lets us express this as a single flat object: merge the override into
  // `properties` (which legitimizes the key even under
  // `additionalProperties: false`) and preserve `additionalProperties`/`type`
  // as siblings. Downstream renderers that do not unwrap `allOf` can now see
  // the override. (Fixes #366 and #382 Site 1.)
  if (schema.type === "object" && schema.properties) {
    for (const [target, overrideSchema] of Object.entries(propertyOverrides)) {
      // Own-property lookup + defineProperty guard against prototype-pollution
      // vectors when a path target names a key like `__proto__`:
      //   - Plain `obj[target] = value` assignment with target === "__proto__"
      //     invokes the Object.prototype `__proto__` setter, replacing the
      //     object's [[Prototype]] instead of adding an own property.
      //   - `Object.defineProperty` bypasses the setter and writes an own
      //     data property, so the override lands where we expect.
      // `Object.hasOwn` (not `in`) rejects inherited members like
      // `constructor`, avoiding a mis-merge into Object.prototype.constructor.
      if (Object.hasOwn(schema.properties, target)) {
        const existing = schema.properties[target];
        if (existing) {
          mergeSchemaOverride(existing, overrideSchema);
          continue;
        }
      }
      Object.defineProperty(schema.properties, target, {
        value: overrideSchema,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    return schema;
  }

  // Pre-composed allOf base: flatten to siblings when the composition is
  // expressible that way under 2020-12; otherwise append as a new allOf
  // member. Expressible-as-siblings means the allOf has a single member whose
  // keys do not conflict with the override's keys (mirrors the $ref-sibling
  // fix in #365 above). (Fixes #382 Site 2.)
  if (schema.allOf) {
    const overrideMember: JsonSchema2020 = { properties: propertyOverrides };
    const flattened = tryFlattenAllOfToSiblings(schema, overrideMember);
    if (flattened !== undefined) {
      return flattened;
    }
    schema.allOf = [...schema.allOf, overrideMember];
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
      return generateEnumType(type, ctx);

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
      return generateDynamicType(type, ctx);

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
 * Enum emission is caller-configurable. The default `enum` mode keeps the
 * compact keyword and adds a complete vendor-prefixed display-name map when
 * any member label is available. The `oneOf` mode emits per-member `const`
 * entries, and includes `title` only when the member has an explicit
 * `@displayName` that differs from the value — omitting redundant titles
 * such as `{ "const": "USD", "title": "USD" }` (#310). `smart-size`
 * chooses `oneOf` only when any effective title differs from the serialized
 * enum value.
 */
function generateEnumType(type: EnumTypeNode, ctx: GeneratorContext): JsonSchema2020 {
  if (
    ctx.enumSerialization === "oneOf" ||
    (ctx.enumSerialization === "smart-size" && shouldSerializeEnumAsOneOf(type))
  ) {
    return {
      oneOf: type.members.map((m) => {
        const stringValue = String(m.value);
        const title =
          m.displayName !== undefined && m.displayName !== stringValue ? m.displayName : undefined;
        return title !== undefined ? { const: m.value, title } : { const: m.value };
      }),
    };
  }

  const schema: JsonSchema2020 = { enum: type.members.map((m) => m.value) };
  if (ctx.enumSerialization === "smart-size") {
    return schema;
  }

  const displayNames = buildEnumDisplayNameExtension(type);
  if (displayNames !== undefined) {
    // Emit either no extension at all or a complete map for every member.
    schema[emitKey("displayNames", ctx)] = displayNames;
  }
  return schema;
}

/**
 * `smart-size` can stay compact when every visible title would only restate
 * the enum value. Any distinct title requires `oneOf` so that label survives.
 */
function shouldSerializeEnumAsOneOf(type: EnumTypeNode): boolean {
  return type.members.some((member) => {
    const title = member.displayName ?? String(member.value);
    return title !== String(member.value);
  });
}

function buildEnumDisplayNameExtension(type: EnumTypeNode): Record<string, string> | undefined {
  if (!type.members.some((member) => member.displayName !== undefined)) {
    return undefined;
  }

  const displayNames: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const member of type.members) {
    const key = String(member.value);
    if (Object.hasOwn(displayNames, key)) {
      throw new Error(
        `Enum display-name key "${key}" is ambiguous after stringification. ` +
          `Use oneOf serialization for mixed string/number enum values that collide.`
      );
    }
    displayNames[key] = member.displayName ?? key;
  }

  return displayNames;
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
    schema.required = required.sort();
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
  applyAnnotations(schema, prop.annotations, ctx, prop.type);
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

function getSerializedFieldName(field: Pick<FieldNode, "name" | "metadata">): string {
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

function dereferenceTypeNode(
  typeNode: TypeNode | undefined,
  ctx: GeneratorContext
): TypeNode | undefined {
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

  // Null-prototype map so path-targeted keys like `__proto__` or `constructor`
  // become own properties rather than invoking Object.prototype setters or
  // matching inherited members. This is the upstream half of the
  // prototype-pollution hardening at Site 1 in `applyPathTargetedConstraints`:
  // without it, `overrides["__proto__"] = ...` replaces this map's own
  // [[Prototype]] and `Object.entries(overrides)` yields `[]`, silently
  // dropping the constraint before the Site 1 guard can run.
  const overrides = Object.create(null) as Record<string, JsonSchema2020>;
  for (const [target, constraints] of byTarget) {
    const resolvedName = resolveSerializedPropertyName(target, typeNode, ctx);
    const schema = buildPathOverrideSchema(
      constraints.map(stripLeadingPathSegment),
      resolveTargetTypeNode(target, typeNode, ctx),
      ctx
    );
    Object.defineProperty(overrides, resolvedName, {
      value: schema,
      writable: true,
      enumerable: true,
      configurable: true,
    });
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

/**
 * Attempts to flatten a pre-composed `allOf` schema into sibling keywords
 * when the JSON Schema 2020-12 evaluation semantics allow it.
 *
 * Flattening is safe when the allOf has **exactly one** member and that
 * member's keys do not collide with either the outer schema's keys or the
 * new override member's keys. In that case we lift the single member's
 * keys up alongside the outer schema and attach the override as siblings —
 * producing `{ <outer keys...>, <member keys...>, <override keys...> }`.
 *
 * When flattening is not safe (multiple members, or key collisions that
 * would silently overwrite one contribution), returns `undefined` and the
 * caller falls back to appending an `allOf` member.
 *
 * The single-member restriction is a conservative scope choice, not a
 * JSON Schema 2020-12 semantic constraint. In-tree emission paths only
 * ever produce single-member `allOf` wrappers. Multi-member `allOf`
 * reaches this helper only from user-supplied `toJsonSchema` hooks,
 * where the multiple members typically represent intentional composition
 * that should not be silently flattened. Pairwise-disjoint N-member
 * flattening is semantically valid but is not performed today because
 * no current producer requires it.
 *
 * Mirrors the `$ref`-sibling fix at `ir-generator.ts:492-497` (issue #364).
 *
 * @see https://github.com/mike-north/formspec/issues/382 Site 2
 * @see https://json-schema.org/draft/2020-12/json-schema-core — §10.2.1 sibling keywords
 */
function tryFlattenAllOfToSiblings(
  schema: JsonSchema2020,
  overrideMember: JsonSchema2020
): JsonSchema2020 | undefined {
  if (schema.allOf?.length !== 1) {
    return undefined;
  }

  // Defensive-only; required under `noUncheckedIndexedAccess`.
  const [soleMember] = schema.allOf;
  if (soleMember === undefined) {
    return undefined;
  }

  // Outer schema sans allOf — what the siblings would sit next to.
  const { allOf: _allOf, ...outerRest } = schema;

  const outerKeys = new Set(Object.keys(outerRest));
  const memberKeys = new Set(Object.keys(soleMember));
  const overrideKeys = new Set(Object.keys(overrideMember));

  // Any overlap between the three contributions would silently overwrite
  // one side — keep `allOf` to preserve both under 2020-12 evaluation.
  for (const key of memberKeys) {
    if (outerKeys.has(key) || overrideKeys.has(key)) {
      return undefined;
    }
  }
  for (const key of overrideKeys) {
    if (outerKeys.has(key)) {
      return undefined;
    }
  }

  return {
    ...outerRest,
    ...soleMember,
    ...overrideMember,
  };
}

function mergeSchemaOverride(target: JsonSchema2020, override: JsonSchema2020): void {
  const nullableValueBranch = getNullableUnionValueSchema(target);
  if (nullableValueBranch !== undefined) {
    mergeSchemaOverride(nullableValueBranch, override);
    return;
  }

  if (override.properties !== undefined) {
    // Fresh maps use a null prototype so `__proto__`-named path segments can
    // land as own properties. Existing maps are preserved as-is — when they
    // came from `buildPropertyOverrides` they are already null-prototype; when
    // they came from an external `toJsonSchema` hook they are a plain object
    // whose own-property shape we do not modify.
    const mergedProperties =
      target.properties ?? (Object.create(null) as Record<string, JsonSchema2020>);
    for (const [name, propertyOverride] of Object.entries(override.properties)) {
      const existing = Object.hasOwn(mergedProperties, name) ? mergedProperties[name] : undefined;
      if (existing === undefined) {
        // `defineProperty` bypasses the `__proto__` setter on regular-prototype
        // maps; safe no-op on null-prototype maps. See the hardening comment
        // at Site 1 in `applyPathTargetedConstraints` for the full rationale.
        Object.defineProperty(mergedProperties, name, {
          value: propertyOverride,
          writable: true,
          enumerable: true,
          configurable: true,
        });
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
    // `defineProperty` guards against the same prototype-pollution vector as
    // the nested-properties branch above, for completeness. Schema keywords
    // like `minimum`/`type` are never `__proto__`, but callers reach this
    // code path through recursion from path-targeted overrides where the
    // boundary is not locally enforceable.
    Object.defineProperty(target, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
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
 * Dynamic enums emit `x-<vendor>-option-source` and optionally
 * `x-<vendor>-option-source-params`.
 * Dynamic schemas emit `x-<vendor>-schema-source` with `additionalProperties: true`
 * since the actual schema is determined at runtime (per the JSON Schema vocabulary spec §3.2).
 */
function generateDynamicType(type: DynamicTypeNode, ctx: GeneratorContext): JsonSchema2020 {
  if (type.dynamicKind === "enum") {
    const schema: JsonSchema2020 = {
      type: "string",
      [emitKey("optionSource", ctx)]: type.sourceKey,
    };
    if (type.parameterFields.length > 0) {
      schema[emitKey("optionSourceParams", ctx)] = [...type.parameterFields];
    }
    return schema;
  }

  // dynamicKind === "schema"
  return {
    type: "object",
    additionalProperties: true,
    [emitKey("schemaSource", ctx)]: type.sourceKey,
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
  ctx: GeneratorContext,
  typeNode?: TypeNode
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
        schema[emitKey("remarks", ctx)] = annotation.value;
        break;

      case "defaultValue":
        schema.default = coerceDefaultValue(annotation.value, typeNode, schema, ctx);
        break;

      case "format":
        schema.format = annotation.value;
        break;

      case "deprecated":
        schema.deprecated = true;
        if (annotation.message !== undefined && annotation.message !== "") {
          schema[emitKey("deprecationDescription", ctx)] = annotation.message;
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

/**
 * Coerces a `@defaultValue` literal to match the serialized shape of the
 * field's type.
 *
 * `@defaultValue` arguments are parsed as JavaScript literals (numbers,
 * booleans, strings, etc.) by the TSDoc parser and injected into the emitted
 * JSON Schema as-is. For custom types whose `toJsonSchema` output differs in
 * runtime shape from the parsed literal (for example, `Decimal` maps to
 * `{ type: "string" }` but authors naturally write `@defaultValue 9.99`),
 * emitting the literal unchanged produces a schema where `default` is
 * inconsistent with `type` — the emitted `default` would fail validation
 * against the very schema declaring it (see GitHub issue #358).
 *
 * Coercion strategy:
 * 1. If the underlying type is a custom type with a `serializeDefault` hook,
 *    delegate fully to the extension.
 * 2. Otherwise, fall back to best-effort inference based on the `type` keyword
 *    on the already-emitted schema: when the emitted schema has
 *    `type: "string"`, coerce primitive non-string literals currently handled
 *    by this function (`number`, `boolean`, and `bigint`) to strings. Other
 *    values are left unchanged unless the extension provides
 *    `serializeDefault`.
 * 3. For non-custom types, pass the value through unchanged.
 */
function coerceDefaultValue(
  value: unknown,
  typeNode: TypeNode | undefined,
  emittedSchema: JsonSchema2020,
  ctx: GeneratorContext
): unknown {
  if (typeNode?.kind !== "custom") {
    return value;
  }
  const registration = ctx.extensionRegistry?.findType(typeNode.typeId);
  if (registration === undefined) {
    return value;
  }

  if (registration.serializeDefault !== undefined) {
    return registration.serializeDefault(value, typeNode.payload);
  }

  // Inference fallback: reuse the already-emitted schema from generateCustomType
  // rather than invoking `toJsonSchema` a second time — that call may be
  // expensive and is not required to be pure.
  const declaredType = (emittedSchema as Record<string, unknown>)["type"];
  if (declaredType === "string" && typeof value !== "string") {
    // Coerce number/boolean/bigint literals into their string form so the
    // emitted `default` conforms to the custom type's JSON Schema `type`.
    // Non-finite numbers (NaN, Infinity, -Infinity) are not representable in
    // JSON Schema and would stringify to values like "NaN" that the author
    // almost certainly did not mean — pass them through unchanged and let
    // downstream validation surface the issue.
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        return value;
      }
      return String(value);
    }
    if (typeof value === "boolean") {
      return String(value);
    }
    if (typeof value === "bigint") {
      return value.toString();
    }
  }

  return value;
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

/**
 * JSON Schema keywords that vocabulary-mode constraints (`emitsVocabularyKeywords`)
 * must not overwrite. Includes standard JSON Schema keywords (2020-12 and legacy):
 * structural (`type`, `properties`, `$ref`), annotation (`title`, `description`),
 * and validation (`minimum`, `maximum`, `minLength`, etc.).
 *
 * Integer types are now builtin (via `__integerBrand`), so standard numeric
 * constraints (`@minimum`, `@maximum`, etc.) are handled natively by the IR
 * pipeline — extensions never need to emit these keywords.
 */
const VOCABULARY_MODE_BLOCKED_KEYWORDS = new Set([
  "$schema",
  "$ref",
  "$defs",
  "$id",
  "$anchor",
  "$dynamicRef",
  "$dynamicAnchor",
  "$vocabulary",
  "$comment",
  "type",
  "enum",
  "const",
  "properties",
  "patternProperties",
  "additionalProperties",
  "required",
  "items",
  "prefixItems",
  "additionalItems",
  "contains",
  "allOf",
  "oneOf",
  "anyOf",
  "not",
  "if",
  "then",
  "else",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
  "minContains",
  "maxContains",
  "format",
  "title",
  "description",
  "default",
  "deprecated",
  "readOnly",
  "writeOnly",
  "examples",
  "dependentRequired",
  "dependentSchemas",
  "propertyNames",
  "unevaluatedItems",
  "unevaluatedProperties",
  "contentEncoding",
  "contentMediaType",
  "contentSchema",
]);

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

  const extensionSchema = registration.toJsonSchema(constraint.payload, ctx.vendorPrefix);

  if (registration.emitsVocabularyKeywords) {
    // Vocabulary-mode: assign keywords directly without prefix enforcement.
    // Guard against accidental collisions with standard JSON Schema keywords.
    const target = schema as Record<string, unknown>;
    for (const [key, value] of Object.entries(extensionSchema)) {
      if (VOCABULARY_MODE_BLOCKED_KEYWORDS.has(key)) {
        throw new Error(
          `Custom constraint "${constraint.constraintId}" with emitsVocabularyKeywords ` +
            `must not overwrite standard JSON Schema keyword "${key}"`
        );
      }
      target[key] = value;
    }
  } else {
    assignVendorPrefixedExtensionKeywords(
      schema,
      extensionSchema,
      ctx.vendorPrefix,
      `custom constraint "${constraint.constraintId}"`
    );
  }
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
