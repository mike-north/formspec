/**
 * Type converter for transforming TypeScript types to JSON Schema and FormSpec.
 *
 * Converts TypeScript types (extracted via type checker) to:
 * - JSON Schema definitions
 * - FormSpec field definitions
 */

import * as ts from "typescript";
import type { DecoratorInfo } from "./decorator-extractor.js";

/**
 * JSON Schema type definition.
 */
export interface JsonSchema {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  pattern?: string;
  format?: string;
  title?: string;
  description?: string;
  default?: unknown;
  deprecated?: boolean;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
}

/**
 * Registry for tracking named types that should be emitted as $defs.
 */
export class DefsRegistry {
  private readonly defs = new Map<string, JsonSchema>();
  private readonly processing = new Set<string>();
  /**
   * Tracks the current highest suffix counter for each base name.
   * Used by registerAndGetName to generate _2, _3, ... dedup keys.
   */
  private readonly nameCounters = new Map<string, number>();

  /**
   * Warning messages emitted when a name collision is resolved by deduplication.
   * Consumers (e.g. generateClassSchemas) should surface these as diagnostics.
   */
  readonly warnings: string[] = [];

  /** Check if a type has already been registered. */
  has(name: string): boolean {
    return this.defs.has(name);
  }

  /** Get a registered schema. */
  get(name: string): JsonSchema | undefined {
    return this.defs.get(name);
  }

  /** Register a named type's schema. */
  set(name: string, schema: JsonSchema): void {
    this.defs.set(name, schema);
  }

  /** Mark a type as currently being processed (for cycle detection). */
  markProcessing(name: string): void {
    this.processing.add(name);
  }

  /** Unmark a type as being processed. */
  unmarkProcessing(name: string): void {
    this.processing.delete(name);
  }

  /** Check if a type is currently being processed (cycle). */
  isProcessing(name: string): boolean {
    return this.processing.has(name);
  }

  /**
   * Registers a schema under the given base name and returns the actual key used.
   *
   * - First registration for a name: stores as-is, returns the name unchanged.
   * - Same name with identical schema: idempotent, returns the existing name.
   * - Same name with a different schema (collision): stores under `<name>_2`,
   *   `<name>_3`, etc., annotates the deduplicated entry with `title: name` so
   *   the original name is preserved, records a warning, and returns the new key.
   *
   * This mirrors the API Extractor convention for resolving `$defs` name
   * collisions that arise when two generic type specialisations share the same
   * symbol name (e.g. `Box<string>` and `Box<number>` both resolve to "Box").
   */
  registerAndGetName(name: string, schema: JsonSchema): string {
    const existing = this.defs.get(name);

    if (existing !== undefined) {
      // Idempotent: same schema already stored under this name -- reuse it.
      if (this.schemasEqual(existing, schema)) {
        return name;
      }

      // Collision: different schema for the same name -- deduplicate.
      const counter = (this.nameCounters.get(name) ?? 1) + 1;
      this.nameCounters.set(name, counter);
      const dedupName = `${name}_${String(counter)}`;

      // Annotate with the original name so downstream consumers can recover it.
      const annotated: JsonSchema = { ...schema, title: name };
      this.defs.set(dedupName, annotated);

      this.warnings.push(
        `$defs name collision: "${name}" registered with different schemas. ` +
          `Using "${dedupName}" for the second registration. ` +
          `Consider using unique type names to avoid this.`
      );

      return dedupName;
    }

    // First registration for this name.
    this.defs.set(name, schema);
    return name;
  }

  /** Get all $defs as a plain object. */
  toObject(): Record<string, JsonSchema> {
    const result: Record<string, JsonSchema> = {};
    for (const [name, schema] of this.defs) {
      result[name] = schema;
    }
    return result;
  }

  /** Check if there are any $defs registered. */
  get size(): number {
    return this.defs.size;
  }

  /**
   * Compares two JSON Schema objects for structural equality using JSON
   * serialisation. Key ordering must match because schemas are constructed
   * deterministically within a single run.
   */
  private schemasEqual(a: JsonSchema, b: JsonSchema): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }
}

/**
 * FormSpec field definition (simplified for output).
 */
export interface FormSpecField {
  _field: string;
  id: string;
  label?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  options?: (string | { id: string; label: string })[];
  order?: number;
  showWhen?: { field: string; value: unknown };
  hideWhen?: { field: string; value: unknown };
  group?: string;
  fields?: FormSpecField[]; // Nested fields for object types
}

/**
 * Result of converting a TypeScript type.
 */
export interface TypeConversionResult {
  /** JSON Schema representation */
  jsonSchema: JsonSchema;
  /** FormSpec field type */
  formSpecFieldType: string;
}

/**
 * Converts a TypeScript type to JSON Schema and FormSpec field type.
 *
 * @param type - The TypeScript type to convert
 * @param checker - TypeScript type checker
 * @param defsRegistry - Optional registry for tracking named types as $defs
 * @returns Conversion result with JSON Schema and FormSpec type
 */
export function convertType(
  type: ts.Type,
  checker: ts.TypeChecker,
  defsRegistry?: DefsRegistry
): TypeConversionResult {
  // Handle primitive types
  if (type.flags & ts.TypeFlags.String) {
    return { jsonSchema: { type: "string" }, formSpecFieldType: "text" };
  }

  if (type.flags & ts.TypeFlags.Number) {
    return { jsonSchema: { type: "number" }, formSpecFieldType: "number" };
  }

  if (type.flags & ts.TypeFlags.Boolean) {
    return { jsonSchema: { type: "boolean" }, formSpecFieldType: "boolean" };
  }

  if (type.flags & ts.TypeFlags.Null) {
    return { jsonSchema: { type: "null" }, formSpecFieldType: "null" };
  }

  if (type.flags & ts.TypeFlags.Undefined) {
    return { jsonSchema: {}, formSpecFieldType: "undefined" };
  }

  // Handle literal types
  if (type.isStringLiteral()) {
    return {
      jsonSchema: { const: type.value },
      formSpecFieldType: "enum",
    };
  }

  if (type.isNumberLiteral()) {
    return {
      jsonSchema: { const: type.value },
      formSpecFieldType: "number",
    };
  }

  // Handle union types (including string literal unions for enums)
  if (type.isUnion()) {
    return convertUnionType(type, checker, defsRegistry);
  }

  // Handle array types
  if (checker.isArrayType(type)) {
    return convertArrayType(type, checker, defsRegistry);
  }

  // Handle object types
  if (type.flags & ts.TypeFlags.Object) {
    return convertObjectType(type as ts.ObjectType, checker, defsRegistry);
  }

  // Fallback
  return { jsonSchema: {}, formSpecFieldType: "unknown" };
}

/**
 * Converts a union type to JSON Schema.
 */
function convertUnionType(
  type: ts.UnionType,
  checker: ts.TypeChecker,
  defsRegistry?: DefsRegistry
): TypeConversionResult {
  const types = type.types;

  // Filter out null and undefined for analysis
  // Note: undefined is filtered out since JSON Schema doesn't have an undefined type
  // Optional fields are handled via the 'required' array, not the type
  const nonNullTypes = types.filter(
    (t) => !(t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))
  );
  const hasNull = types.some((t) => t.flags & ts.TypeFlags.Null);

  // Check if this is a boolean type (true | false in TypeScript)
  // TypeScript represents `boolean` as a union of `true | false` literal types
  const isBooleanUnion =
    nonNullTypes.length === 2 && nonNullTypes.every((t) => t.flags & ts.TypeFlags.BooleanLiteral);

  if (isBooleanUnion) {
    const result: TypeConversionResult = {
      jsonSchema: { type: "boolean" },
      formSpecFieldType: "boolean",
    };
    if (hasNull) {
      result.jsonSchema = { oneOf: [{ type: "boolean" }, { type: "null" }] };
    }
    return result;
  }

  // Check if all types are string literals (enum pattern)
  // Per JSON Schema spec: enum values are self-constraining; type is redundant alongside enum
  const allStringLiterals = nonNullTypes.every((t) => t.isStringLiteral());
  if (allStringLiterals && nonNullTypes.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- TypeScript doesn't narrow array types from `every` predicate
    const enumValues = nonNullTypes.map((t) => (t as ts.StringLiteralType).value);
    const result: TypeConversionResult = {
      jsonSchema: { enum: enumValues },
      formSpecFieldType: "enum",
    };
    if (hasNull) {
      result.jsonSchema = { oneOf: [{ enum: enumValues }, { type: "null" }] };
    }
    return result;
  }

  // Check if all types are number literals
  // Per JSON Schema spec: enum values are self-constraining; type is redundant alongside enum
  const allNumberLiterals = nonNullTypes.every((t) => t.isNumberLiteral());
  if (allNumberLiterals && nonNullTypes.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- TypeScript doesn't narrow array types from `every` predicate
    const enumValues = nonNullTypes.map((t) => (t as ts.NumberLiteralType).value);
    const result: TypeConversionResult = {
      jsonSchema: { enum: enumValues },
      formSpecFieldType: "enum",
    };
    if (hasNull) {
      result.jsonSchema = { oneOf: [{ enum: enumValues }, { type: "null" }] };
    }
    return result;
  }

  // Handle nullable types (T | null or T | undefined) with single non-null type
  if (nonNullTypes.length === 1 && nonNullTypes[0]) {
    const result = convertType(nonNullTypes[0], checker, defsRegistry);
    // Make it nullable in JSON Schema
    if (hasNull) {
      result.jsonSchema = { oneOf: [result.jsonSchema, { type: "null" }] };
    }
    return result;
  }

  // General union - use oneOf (filter out undefined which isn't valid in JSON Schema)
  const schemas = nonNullTypes.map((t) => convertType(t, checker, defsRegistry).jsonSchema);
  if (hasNull) {
    schemas.push({ type: "null" });
  }
  return {
    jsonSchema: { oneOf: schemas },
    formSpecFieldType: "union",
  };
}

/**
 * Converts an array type to JSON Schema.
 */
function convertArrayType(
  type: ts.Type,
  checker: ts.TypeChecker,
  defsRegistry?: DefsRegistry
): TypeConversionResult {
  const typeArgs = (type as ts.TypeReference).typeArguments;
  const elementType = typeArgs?.[0];

  const itemSchema = elementType ? convertType(elementType, checker, defsRegistry).jsonSchema : {};

  return {
    jsonSchema: {
      type: "array",
      items: itemSchema,
    },
    formSpecFieldType: "array",
  };
}

/**
 * Returns the declared name for a named type (interface, class, type alias),
 * or null for anonymous/built-in types.
 */
function getNamedTypeName(type: ts.ObjectType, _checker: ts.TypeChecker): string | null {
  // Try the type's own symbol first, then aliasSymbol for type aliases
  const symbol = type.getSymbol() ?? (type as ts.Type & { aliasSymbol?: ts.Symbol }).aliasSymbol;
  if (!symbol) return null;

  const name = symbol.getName();

  // Skip anonymous and built-in types
  if (!name || name === "__type" || name === "__object" || name === "Array") {
    return null;
  }

  const declarations = symbol.getDeclarations();
  if (!declarations || declarations.length === 0) return null;

  const decl = declarations[0];
  if (
    decl &&
    (ts.isInterfaceDeclaration(decl) ||
      ts.isClassDeclaration(decl) ||
      ts.isTypeAliasDeclaration(decl))
  ) {
    return name;
  }

  return null;
}

/**
 * Builds the inline object schema from a TypeScript object type.
 */
function buildObjectSchema(
  type: ts.ObjectType,
  checker: ts.TypeChecker,
  defsRegistry?: DefsRegistry
): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  const props = type.getProperties();

  for (const prop of props) {
    const propType = checker.getTypeOfSymbolAtLocation(
      prop,
      prop.valueDeclaration ?? prop.declarations?.[0] ?? ({} as ts.Node)
    );

    const propSchema = convertType(propType, checker, defsRegistry).jsonSchema;
    properties[prop.name] = propSchema;

    // Check if property is optional
    const isOptional = prop.flags & ts.SymbolFlags.Optional;
    if (!isOptional) {
      required.push(prop.name);
    }
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

/**
 * Converts an object type to JSON Schema.
 *
 * Named types (interfaces, classes, type aliases) are registered in the
 * defsRegistry and returned as $ref pointers to avoid inlining the same
 * schema multiple times. Anonymous inline types are always inlined.
 */
function convertObjectType(
  type: ts.ObjectType,
  checker: ts.TypeChecker,
  defsRegistry?: DefsRegistry
): TypeConversionResult {
  const typeName = getNamedTypeName(type, checker);

  if (typeName && defsRegistry) {
    // Already registered -- return $ref directly
    if (defsRegistry.has(typeName)) {
      return {
        jsonSchema: { $ref: `#/$defs/${typeName}` },
        formSpecFieldType: "object",
      };
    }

    // Currently processing (circular reference) -- return $ref; resolution happens after
    if (defsRegistry.isProcessing(typeName)) {
      return {
        jsonSchema: { $ref: `#/$defs/${typeName}` },
        formSpecFieldType: "object",
      };
    }

    // Mark as processing to detect cycles
    defsRegistry.markProcessing(typeName);

    // Build the full schema (may recurse)
    const schema = buildObjectSchema(type, checker, defsRegistry);

    // Register (with deduplication) and unmark
    const finalName = defsRegistry.registerAndGetName(typeName, schema);
    defsRegistry.unmarkProcessing(typeName);

    return {
      jsonSchema: { $ref: `#/$defs/${finalName}` },
      formSpecFieldType: "object",
    };
  }

  // No registry or unnamed type -- inline the schema
  return {
    jsonSchema: buildObjectSchema(type, checker, defsRegistry),
    formSpecFieldType: "object",
  };
}

/**
 * Creates a FormSpec field definition from a field's type and decorators.
 *
 * @param fieldName - The field name
 * @param type - The TypeScript type
 * @param decorators - Decorators applied to the field
 * @param optional - Whether the field is optional
 * @param checker - TypeScript type checker
 * @returns FormSpec field definition
 */
export function createFormSpecField(
  fieldName: string,
  type: ts.Type,
  decorators: DecoratorInfo[],
  optional: boolean,
  checker: ts.TypeChecker
): FormSpecField {
  const { formSpecFieldType } = convertType(type, checker);

  const field: FormSpecField = {
    _field: formSpecFieldType,
    id: fieldName,
  };

  // Apply optionality
  if (!optional) {
    field.required = true;
  }

  // For object types, recursively add nested fields.
  // Note: the UI schema always inlines nested fields regardless of $defs/
  // $ref usage in the JSON Schema -- the UI schema is resolved separately.
  if (formSpecFieldType === "object" && type.flags & ts.TypeFlags.Object) {
    const objectType = type as ts.ObjectType;
    const nestedFields: FormSpecField[] = [];

    for (const prop of objectType.getProperties()) {
      const propType = checker.getTypeOfSymbolAtLocation(
        prop,
        prop.valueDeclaration ?? prop.declarations?.[0] ?? ({} as ts.Node)
      );
      const propOptional = !!(prop.flags & ts.SymbolFlags.Optional);

      // Note: We don't have access to decorators on nested class properties here
      // since we're analyzing the type, not the class declaration
      nestedFields.push(createFormSpecField(prop.name, propType, [], propOptional, checker));
    }

    if (nestedFields.length > 0) {
      field.fields = nestedFields;
    }
  }

  // Apply decorator values
  for (const dec of decorators) {
    applyDecoratorToField(field, dec, type, checker);
  }

  return field;
}

/**
 * Applies a decorator's values to a FormSpec field.
 *
 * @param field - The FormSpec field to modify
 * @param decorator - The decorator information to apply
 * @param _type - The TypeScript type (unused but kept for future use)
 * @param _checker - The TypeScript type checker (unused but kept for future use)
 */
function applyDecoratorToField(
  field: FormSpecField,
  decorator: DecoratorInfo,
  _type: ts.Type,
  _checker: ts.TypeChecker
): void {
  const { name, args } = decorator;

  switch (name) {
    case "Label":
      if (typeof args[0] === "string") {
        field.label = args[0];
      }
      break;

    case "Placeholder":
      if (typeof args[0] === "string") {
        field.placeholder = args[0];
      }
      break;

    case "Description":
      if (typeof args[0] === "string") {
        field.description = args[0];
      }
      break;

    case "Min":
      if (typeof args[0] === "number") {
        field.min = args[0];
      }
      break;

    case "Max":
      if (typeof args[0] === "number") {
        field.max = args[0];
      }
      break;

    case "Step":
      if (typeof args[0] === "number") {
        field.step = args[0];
      }
      break;

    case "MinLength":
      if (typeof args[0] === "number") {
        field.minLength = args[0];
      }
      break;

    case "MaxLength":
      if (typeof args[0] === "number") {
        field.maxLength = args[0];
      }
      break;

    case "MinItems":
      if (typeof args[0] === "number") {
        field.minItems = args[0];
      }
      break;

    case "MaxItems":
      if (typeof args[0] === "number") {
        field.maxItems = args[0];
      }
      break;

    case "Pattern":
      if (typeof args[0] === "string") {
        field.pattern = args[0];
      }
      break;

    case "EnumOptions":
      if (Array.isArray(args[0])) {
        field.options = args[0] as (string | { id: string; label: string })[];
      }
      break;

    case "ShowWhen":
      if (typeof args[0] === "object" && args[0] !== null) {
        const sw = args[0] as { field?: unknown; value?: unknown };
        if (typeof sw.field === "string") {
          field.showWhen = { field: sw.field, value: sw.value };
        }
      }
      break;

    case "Group":
      if (typeof args[0] === "string") {
        field.group = args[0];
      }
      break;
  }
}

/**
 * Applies decorator constraints to a JSON Schema.
 *
 * @param schema - The base JSON Schema
 * @param decorators - Decorators to apply
 * @returns Modified JSON Schema with constraints
 */
export function applyDecoratorsToSchema(
  schema: JsonSchema,
  decorators: DecoratorInfo[]
): JsonSchema {
  const result = { ...schema };

  for (const dec of decorators) {
    const { name, args } = dec;

    switch (name) {
      case "Label":
        if (typeof args[0] === "string") {
          result.title = args[0];
        }
        break;

      case "Description":
        if (typeof args[0] === "string") {
          result.description = args[0];
        }
        break;

      case "Min":
        if (typeof args[0] === "number") {
          result.minimum = args[0];
        }
        break;

      case "Max":
        if (typeof args[0] === "number") {
          result.maximum = args[0];
        }
        break;

      case "MinLength":
        if (typeof args[0] === "number") {
          result.minLength = args[0];
        }
        break;

      case "MaxLength":
        if (typeof args[0] === "number") {
          result.maxLength = args[0];
        }
        break;

      case "MinItems":
        if (typeof args[0] === "number") {
          result.minItems = args[0];
        }
        break;

      case "MaxItems":
        if (typeof args[0] === "number") {
          result.maxItems = args[0];
        }
        break;

      case "Pattern":
        if (typeof args[0] === "string") {
          result.pattern = args[0];
        }
        break;
    }
  }

  return result;
}
