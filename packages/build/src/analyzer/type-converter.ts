/**
 * Type converter for transforming TypeScript types to JSON Schema and FormSpec.
 *
 * Converts TypeScript types (extracted via type checker) to:
 * - JSON Schema definitions
 * - FormSpec field definitions
 */

import * as ts from "typescript";
import type { DecoratorInfo } from "./decorator-extractor.js";
import type { FieldInfo } from "./class-analyzer.js";
import { setSchemaExtension, type ExtendedJSONSchema7 } from "../json-schema/types.js";

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
  showWhen?: object;
  group?: string;
  fields?: FormSpecField[]; // Nested fields for object types
}

/**
 * Result of converting a TypeScript type.
 */
export interface TypeConversionResult {
  /** JSON Schema representation */
  jsonSchema: ExtendedJSONSchema7;
  /** FormSpec field type */
  formSpecFieldType: string;
}

/**
 * Converts a TypeScript type to JSON Schema and FormSpec field type.
 *
 * @param type - The TypeScript type to convert
 * @param checker - TypeScript type checker
 * @returns Conversion result with JSON Schema and FormSpec type
 */
export function convertType(type: ts.Type, checker: ts.TypeChecker): TypeConversionResult {
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
    return convertUnionType(type, checker);
  }

  // Handle array types
  if (checker.isArrayType(type)) {
    return convertArrayType(type, checker);
  }

  // Handle object types
  if (type.flags & ts.TypeFlags.Object) {
    return convertObjectType(type as ts.ObjectType, checker);
  }

  // Fallback
  return { jsonSchema: {}, formSpecFieldType: "unknown" };
}

/**
 * Converts a union type to JSON Schema.
 */
function convertUnionType(type: ts.UnionType, checker: ts.TypeChecker): TypeConversionResult {
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
    const result = convertType(nonNullTypes[0], checker);
    // Make it nullable in JSON Schema
    if (hasNull) {
      result.jsonSchema = { oneOf: [result.jsonSchema, { type: "null" }] };
    }
    return result;
  }

  // General union - use oneOf (filter out undefined which isn't valid in JSON Schema)
  const schemas = nonNullTypes.map((t) => convertType(t, checker).jsonSchema);
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
function convertArrayType(type: ts.Type, checker: ts.TypeChecker): TypeConversionResult {
  const typeArgs = (type as ts.TypeReference).typeArguments;
  const elementType = typeArgs?.[0];

  const itemSchema = elementType ? convertType(elementType, checker).jsonSchema : {};

  return {
    jsonSchema: {
      type: "array",
      items: itemSchema,
    },
    formSpecFieldType: "array",
  };
}

/**
 * Converts an object type to JSON Schema.
 */
function convertObjectType(type: ts.ObjectType, checker: ts.TypeChecker): TypeConversionResult {
  const properties: Record<string, ExtendedJSONSchema7> = {};
  const required: string[] = [];

  const props = type.getProperties();

  for (const prop of props) {
    const declaration = prop.valueDeclaration ?? prop.declarations?.[0];
    if (!declaration) continue;

    const propType = checker.getTypeOfSymbolAtLocation(prop, declaration);

    const propSchema = convertType(propType, checker).jsonSchema;
    properties[prop.name] = propSchema;

    // Check if property is optional
    const isOptional = prop.flags & ts.SymbolFlags.Optional;
    if (!isOptional) {
      required.push(prop.name);
    }
  }

  return {
    jsonSchema: {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
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

  // For object types, recursively add nested fields
  if (formSpecFieldType === "object" && type.flags & ts.TypeFlags.Object) {
    const objectType = type as ts.ObjectType;
    const nestedFields: FormSpecField[] = [];

    for (const prop of objectType.getProperties()) {
      const propDeclaration = prop.valueDeclaration ?? prop.declarations?.[0];
      if (!propDeclaration) continue;

      const propType = checker.getTypeOfSymbolAtLocation(prop, propDeclaration);
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
    applyDecoratorToField(field, dec);
  }

  return field;
}

/**
 * Applies a decorator's values to a FormSpec field.
 *
 * Note: Custom decorator extensions (x-formspec-*) are only emitted in JSON Schema
 * via `applyDecoratorsToSchema`, not here. The FormSpecField interface does not
 * carry extension data — extensions are a schema-level concern.
 *
 * @param field - The FormSpec field to modify
 * @param decorator - The decorator information to apply
 */
function applyDecoratorToField(field: FormSpecField, decorator: DecoratorInfo): void {
  const { args } = decorator;
  const resolved = decorator.resolved;

  // If this is an extended decorator, map it to the built-in it extends
  const effectiveName = resolved?.extendsBuiltin ?? decorator.name;

  switch (effectiveName) {
    case "Field": {
      // Field takes an object with displayName, description, placeholder
      const opts = args[0];
      if (typeof opts === "object" && opts !== null && !Array.isArray(opts)) {
        if (typeof opts["displayName"] === "string") {
          field.label = opts["displayName"];
        }
        if (typeof opts["description"] === "string") {
          field.description = opts["description"];
        }
        if (typeof opts["placeholder"] === "string") {
          field.placeholder = opts["placeholder"];
        }
      }
      break;
    }

    case "Minimum":
      if (typeof args[0] === "number") {
        field.min = args[0];
      }
      break;

    case "Maximum":
      if (typeof args[0] === "number") {
        field.max = args[0];
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
        field.showWhen = args[0] as object;
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
 * @param fieldInfo - Optional field info for deprecated/default values
 * @returns Modified JSON Schema with constraints
 */
export function applyDecoratorsToSchema(
  schema: ExtendedJSONSchema7,
  decorators: DecoratorInfo[],
  fieldInfo?: FieldInfo
): ExtendedJSONSchema7 {
  const result = { ...schema };

  for (const dec of decorators) {
    const { args } = dec;
    const resolved = dec.resolved;

    // If this is an extended decorator, map it to the built-in it extends
    const effectiveName = resolved?.extendsBuiltin ?? dec.name;

    switch (effectiveName) {
      case "Field": {
        // Field takes an object: { displayName, description?, placeholder? }
        const opts = args[0];
        if (typeof opts === "object" && opts !== null && !Array.isArray(opts)) {
          if (typeof opts["displayName"] === "string") {
            result.title = opts["displayName"];
          }
          if (typeof opts["description"] === "string") {
            result.description = opts["description"];
          }
        }
        break;
      }

      case "Minimum":
        if (typeof args[0] === "number") {
          result.minimum = args[0];
        }
        break;

      case "Maximum":
        if (typeof args[0] === "number") {
          result.maximum = args[0];
        }
        break;

      case "ExclusiveMinimum":
        if (typeof args[0] === "number") {
          result.exclusiveMinimum = args[0];
        }
        break;

      case "ExclusiveMaximum":
        if (typeof args[0] === "number") {
          result.exclusiveMaximum = args[0];
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

      case "Pattern":
        if (typeof args[0] === "string") {
          result.pattern = args[0];
        }
        break;
    }

    // Emit x-formspec-* for custom decorators with a valid extensionName.
    // Extension names must be lowercase alphanumeric with hyphens (e.g., "title-field", "priority").
    if (resolved?.extensionName && /^[a-z][a-z0-9-]*$/.test(resolved.extensionName)) {
      const key = `x-formspec-${resolved.extensionName}` as const;
      if (resolved.isMarker) {
        setSchemaExtension(result, key, true);
      } else {
        // Parameterized: use first argument as value
        setSchemaExtension(result, key, args[0] ?? true);
      }
    }
  }

  // Apply deprecated and default from FieldInfo
  if (fieldInfo) {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- `deprecated` is a FieldInfo flag tracking @deprecated JSDoc, not itself deprecated
    if (fieldInfo.deprecated) {
      result.deprecated = true;
    }
    if (fieldInfo.defaultValue !== undefined) {
      result.default = fieldInfo.defaultValue;
    }
  }

  return result;
}
