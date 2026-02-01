/**
 * Type extraction logic for the FormSpec transformer.
 *
 * Extracts TypeScript type information from class properties
 * and converts it to a serializable metadata format.
 */

import * as ts from "typescript";

/**
 * Metadata representing a TypeScript type in a serializable format.
 *
 * This interface captures the essential type information needed for
 * runtime form generation. It's designed to be JSON-serializable.
 *
 * @property type - The base type: "string", "number", "boolean", "enum", "array", "object", or "unknown"
 * @property values - For enum types, the literal values (e.g., ["us", "ca", "uk"] or [1, 2, 3])
 * @property itemType - For array types, the metadata describing array elements (recursive)
 * @property properties - For object types, metadata for each property keyed by name (recursive)
 * @property nullable - True if the type includes `| null` (e.g., `string | null`)
 * @property optional - True if the field is optional (e.g., `field?: string`)
 *
 * @example
 * ```typescript
 * // string        → { type: "string" }
 * // number?       → { type: "number", optional: true }
 * // "a" | "b"     → { type: "enum", values: ["a", "b"] }
 * // string[]      → { type: "array", itemType: { type: "string" } }
 * // string | null → { type: "string", nullable: true }
 * // { x: number } → { type: "object", properties: { x: { type: "number" } } }
 * ```
 */
export interface TypeMetadata {
  type: string;
  values?: unknown[];
  itemType?: TypeMetadata;
  properties?: Record<string, TypeMetadata>;
  nullable?: boolean;
  optional?: boolean;
}

/**
 * Extracts type metadata for all properties in a class declaration.
 *
 * @param classNode - The class declaration to extract types from
 * @param checker - TypeScript type checker
 * @returns Record of field names to their type metadata
 */
export function extractTypeMetadata(
  classNode: ts.ClassDeclaration,
  checker: ts.TypeChecker
): Record<string, TypeMetadata> {
  const metadata: Record<string, TypeMetadata> = {};

  for (const member of classNode.members) {
    if (!ts.isPropertyDeclaration(member)) continue;
    if (!member.name || !ts.isIdentifier(member.name)) continue;

    const symbol = checker.getSymbolAtLocation(member.name);
    if (!symbol) continue;

    const type = checker.getTypeOfSymbolAtLocation(symbol, member);
    const fieldName = member.name.text;
    const isOptional = !!(symbol.flags & ts.SymbolFlags.Optional);

    const typeInfo = convertTypeToMetadata(type, checker);
    if (isOptional) {
      typeInfo.optional = true;
    }
    metadata[fieldName] = typeInfo;
  }

  return metadata;
}

/**
 * Converts a TypeScript type to serializable metadata.
 *
 * Handles:
 * - Primitive types (string, number, boolean)
 * - String/number literal unions (enums)
 * - Arrays
 * - Objects with nested properties
 * - Nullable types (T | null)
 * - Optional types (T | undefined)
 *
 * @param type - The TypeScript type to convert
 * @param checker - TypeScript type checker
 * @param visited - Set of already-visited types (for cycle detection)
 */
function convertTypeToMetadata(
  type: ts.Type,
  checker: ts.TypeChecker,
  visited: Set<ts.Type> = new Set()
): TypeMetadata {
  // Cycle detection for recursive types (only for object types, not primitives)
  // Primitives like "string" are shared type objects and must not be tracked
  const isObjectType = (type.flags & ts.TypeFlags.Object) !== 0;
  if (isObjectType) {
    if (visited.has(type)) {
      return { type: "unknown" };
    }
    visited.add(type);
  }
  // Handle union types (enums, nullable, optional)
  if (type.isUnion()) {
    const types = type.types;
    const nonNullTypes = types.filter(
      (t) => !(t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))
    );
    const hasNull = types.some((t) => t.flags & ts.TypeFlags.Null);

    // Check for boolean union (true | false)
    const isBooleanUnion =
      nonNullTypes.length === 2 &&
      nonNullTypes.every((t) => t.flags & ts.TypeFlags.BooleanLiteral);

    if (isBooleanUnion) {
      const result: TypeMetadata = { type: "boolean" };
      if (hasNull) result.nullable = true;
      return result;
    }

    // String literal union = enum
    const allStringLiterals = nonNullTypes.every((t) => t.isStringLiteral());
    if (allStringLiterals && nonNullTypes.length > 0) {
      const result: TypeMetadata = {
        type: "enum",
        values: nonNullTypes.map((t) => (t as ts.StringLiteralType).value),
      };
      if (hasNull) result.nullable = true;
      return result;
    }

    // Number literal union = enum
    const allNumberLiterals = nonNullTypes.every((t) => t.isNumberLiteral());
    if (allNumberLiterals && nonNullTypes.length > 0) {
      const result: TypeMetadata = {
        type: "enum",
        values: nonNullTypes.map((t) => (t as ts.NumberLiteralType).value),
      };
      if (hasNull) result.nullable = true;
      return result;
    }

    // Nullable single type (T | null)
    if (nonNullTypes.length === 1 && nonNullTypes[0]) {
      const result = convertTypeToMetadata(nonNullTypes[0], checker, visited);
      if (hasNull) {
        result.nullable = true;
      }
      return result;
    }

    // Complex union - return as unknown for now
    return { type: "unknown" };
  }

  // Primitives
  if (type.flags & ts.TypeFlags.String) {
    return { type: "string" };
  }
  if (type.flags & ts.TypeFlags.Number) {
    return { type: "number" };
  }
  if (type.flags & ts.TypeFlags.Boolean) {
    return { type: "boolean" };
  }

  // String literal (single value)
  if (type.isStringLiteral()) {
    return { type: "enum", values: [type.value] };
  }

  // Number literal (single value)
  if (type.isNumberLiteral()) {
    return { type: "enum", values: [type.value] };
  }

  // Arrays
  if (checker.isArrayType(type)) {
    const typeArgs = (type as ts.TypeReference).typeArguments;
    return {
      type: "array",
      itemType: typeArgs?.[0]
        ? convertTypeToMetadata(typeArgs[0], checker, visited)
        : { type: "unknown" },
    };
  }

  // Objects
  if (type.flags & ts.TypeFlags.Object) {
    const properties: Record<string, TypeMetadata> = {};
    for (const prop of type.getProperties()) {
      const propType = checker.getTypeOfSymbolAtLocation(
        prop,
        prop.valueDeclaration ?? prop.declarations?.[0] ?? ({} as ts.Node)
      );
      const propOptional = !!(prop.flags & ts.SymbolFlags.Optional);
      const propMeta = convertTypeToMetadata(propType, checker, visited);
      if (propOptional) {
        propMeta.optional = true;
      }
      properties[prop.name] = propMeta;
    }

    // Only include properties if there are any
    if (Object.keys(properties).length > 0) {
      return { type: "object", properties };
    }
    return { type: "object" };
  }

  return { type: "unknown" };
}

/**
 * Converts TypeMetadata to an AST ObjectLiteralExpression.
 *
 * This allows the metadata to be emitted as code in the transformed output.
 */
export function typeMetadataToAst(
  metadata: TypeMetadata,
  factory: ts.NodeFactory
): ts.ObjectLiteralExpression {
  const properties: ts.ObjectLiteralElementLike[] = [];

  // type property
  properties.push(
    factory.createPropertyAssignment(
      "type",
      factory.createStringLiteral(metadata.type)
    )
  );

  // values property (for enums)
  if (metadata.values) {
    properties.push(
      factory.createPropertyAssignment(
        "values",
        factory.createArrayLiteralExpression(
          metadata.values.map((v) =>
            typeof v === "string"
              ? factory.createStringLiteral(v)
              : factory.createNumericLiteral(v as number)
          )
        )
      )
    );
  }

  // itemType property (for arrays)
  if (metadata.itemType) {
    properties.push(
      factory.createPropertyAssignment(
        "itemType",
        typeMetadataToAst(metadata.itemType, factory)
      )
    );
  }

  // properties property (for objects)
  if (metadata.properties) {
    properties.push(
      factory.createPropertyAssignment(
        "properties",
        factory.createObjectLiteralExpression(
          Object.entries(metadata.properties).map(([name, propMeta]) =>
            factory.createPropertyAssignment(
              name,
              typeMetadataToAst(propMeta, factory)
            )
          ),
          true
        )
      )
    );
  }

  // nullable property
  if (metadata.nullable) {
    properties.push(
      factory.createPropertyAssignment("nullable", factory.createTrue())
    );
  }

  // optional property
  if (metadata.optional) {
    properties.push(
      factory.createPropertyAssignment("optional", factory.createTrue())
    );
  }

  return factory.createObjectLiteralExpression(properties, true);
}
