/**
 * Shared TypeScript type classification utilities.
 *
 * Extracted to eliminate duplication across type-converter, type-applicability,
 * class-schema, and codegen modules.
 */

import * as ts from "typescript";

/**
 * Filters out null and undefined from a union's type array.
 * Returns the non-nullable member types.
 */
export function stripNullableTypes(types: readonly ts.Type[]): ts.Type[] {
  return types.filter(
    (t) => !(t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))
  );
}

/**
 * Checks if an array of types forms a boolean literal union (true | false).
 * TypeScript represents `boolean` as `true | false` at the type level.
 */
export function isBooleanLiteralUnion(types: readonly ts.Type[]): boolean {
  return (
    types.length === 2 &&
    types.every((t) => !!(t.flags & ts.TypeFlags.BooleanLiteral))
  );
}

/**
 * Checks if all types in an array are string literals.
 */
export function isStringLiteralUnion(types: readonly ts.Type[]): boolean {
  return types.length > 0 && types.every((t) => t.isStringLiteral());
}

/**
 * Checks if all types in an array are number literals.
 */
export function isNumberLiteralUnion(types: readonly ts.Type[]): boolean {
  return types.length > 0 && types.every((t) => t.isNumberLiteral());
}
