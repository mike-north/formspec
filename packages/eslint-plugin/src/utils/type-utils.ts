/**
 * Utility functions for TypeScript type checking in ESLint rules.
 */

import type { ParserServicesWithTypeInformation } from "@typescript-eslint/utils";
import type { TSESTree } from "@typescript-eslint/utils";
import type ts from "typescript";

/**
 * Field type categories for FormSpec.
 */
export type FieldTypeCategory = "string" | "number" | "boolean" | "array" | "object" | "union" | "unknown";

/**
 * Checks if a TypeScript type is a string type.
 *
 * Handles string primitives, string literals, and unions of string types.
 *
 * @param type - The TypeScript type to check
 * @param checker - The TypeScript type checker instance
 * @returns True if the type is string, a string literal, or a union of string types
 */
export function isStringType(type: ts.Type, checker: ts.TypeChecker): boolean {
  // Check for string primitive
  if (type.flags & 4 /* ts.TypeFlags.String */) {
    return true;
  }

  // Check for string literal
  if (type.flags & 128 /* ts.TypeFlags.StringLiteral */) {
    return true;
  }

  // Check for union of string literals (e.g., "a" | "b")
  if (type.isUnion()) {
    return type.types.every((t) => isStringType(t, checker));
  }

  return false;
}

/**
 * Checks if a TypeScript type is a number type.
 *
 * Handles number primitives, number literals, and unions of number types.
 *
 * @param type - The TypeScript type to check
 * @param checker - The TypeScript type checker instance
 * @returns True if the type is number, a number literal, or a union of number types
 */
export function isNumberType(type: ts.Type, checker: ts.TypeChecker): boolean {
  // Check for number primitive
  if (type.flags & 8 /* ts.TypeFlags.Number */) {
    return true;
  }

  // Check for number literal
  if (type.flags & 256 /* ts.TypeFlags.NumberLiteral */) {
    return true;
  }

  // Check for union of number literals
  if (type.isUnion()) {
    return type.types.every((t) => isNumberType(t, checker));
  }

  return false;
}

/**
 * Checks if a TypeScript type is a boolean type.
 *
 * Handles boolean primitives, boolean literals (true/false), and unions of boolean types.
 *
 * @param type - The TypeScript type to check
 * @param checker - The TypeScript type checker instance
 * @returns True if the type is boolean, true, false, or a union of boolean types
 */
export function isBooleanType(type: ts.Type, checker: ts.TypeChecker): boolean {
  // Check for boolean primitive
  if (type.flags & 16 /* ts.TypeFlags.Boolean */) {
    return true;
  }

  // Check for boolean literal (true or false)
  if (type.flags & 512 /* ts.TypeFlags.BooleanLiteral */) {
    return true;
  }

  // Check for union of true | false
  if (type.isUnion()) {
    return type.types.every((t) => isBooleanType(t, checker));
  }

  return false;
}

/**
 * Checks if a TypeScript type is an array type.
 *
 * Handles Array<T>, T[], and readonly arrays.
 *
 * @param type - The TypeScript type to check
 * @param checker - The TypeScript type checker instance
 * @returns True if the type is an array type
 */
export function isArrayType(type: ts.Type, checker: ts.TypeChecker): boolean {
  // Check symbol name for Array
  const symbol = type.getSymbol();
  if (symbol?.name === "Array") {
    return true;
  }

  // Check for array type node (T[])
  const typeString = checker.typeToString(type);
  if (typeString.endsWith("[]") || typeString.startsWith("Array<")) {
    return true;
  }

  // Check if it's a reference to Array
  const typeRef = type as ts.TypeReference;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- target may not exist on non-reference types
  if (typeRef.target && typeRef.target.symbol?.name === "Array") {
    return true;
  }

  return false;
}

/**
 * Determines the field type category from a TypeScript type.
 *
 * Categories help determine which decorators are valid for a field.
 *
 * @param type - The TypeScript type to categorize
 * @param checker - The TypeScript type checker instance
 * @returns The field type category
 */
export function getFieldTypeCategory(
  type: ts.Type,
  checker: ts.TypeChecker
): FieldTypeCategory {
  if (isStringType(type, checker)) return "string";
  if (isNumberType(type, checker)) return "number";
  if (isBooleanType(type, checker)) return "boolean";
  if (isArrayType(type, checker)) return "array";

  // Check for object types (but not arrays)
  if (type.flags & 524288 /* ts.TypeFlags.Object */) {
    return "object";
  }

  // Check for unions that aren't all strings/numbers
  if (type.isUnion()) {
    return "union";
  }

  return "unknown";
}

/**
 * Gets the TypeScript type of a class property.
 */
export function getPropertyType(
  node: TSESTree.PropertyDefinition,
  services: ParserServicesWithTypeInformation
): ts.Type | null {
  try {
    const checker = services.program.getTypeChecker();
    const tsNode = services.esTreeNodeToTSNodeMap.get(node);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- map.get() can return undefined
    if (!tsNode) return null;

    // Get the type from the type annotation or initializer
    const type = checker.getTypeAtLocation(tsNode);
    return type;
  } catch {
    return null;
  }
}

/**
 * Extracts string literal values from a union type.
 * For type "a" | "b" | "c", returns ["a", "b", "c"].
 */
export function getStringLiteralUnionValues(
  type: ts.Type,
  _checker: ts.TypeChecker
): string[] | null {
  if (!type.isUnion()) {
    // Single string literal
    if (type.isStringLiteral()) {
      return [type.value];
    }
    return null;
  }

  const values: string[] = [];
  for (const t of type.types) {
    if (t.isStringLiteral()) {
      values.push(t.value);
    } else {
      // Not all members are string literals
      return null;
    }
  }

  return values.length > 0 ? values : null;
}

/**
 * Checks if a field is marked as optional (has `?` modifier).
 */
export function isOptionalProperty(node: TSESTree.PropertyDefinition): boolean {
  return node.optional;
}

/**
 * Gets the type checker from parser services.
 */
export function getTypeChecker(
  services: ParserServicesWithTypeInformation
): ts.TypeChecker {
  return services.program.getTypeChecker();
}

/**
 * Converts a TypeScript type to a readable string.
 */
export function typeToString(
  type: ts.Type,
  checker: ts.TypeChecker
): string {
  return checker.typeToString(type);
}
