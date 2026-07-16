/**
 * Utility functions for TypeScript type checking in ESLint rules.
 *
 * ## TypeScript cross-version notes (please read before editing flag checks)
 *
 * The helpers below classify a `ts.Type` by inspecting its bitfield `flags`
 * against entries from the `ts.TypeFlags` enum (e.g. `ts.TypeFlags.String`,
 * `ts.TypeFlags.Null`). It is essential that these checks reference the enum
 * members **by name**, not by their underlying numeric values.
 *
 * ### Why this matters
 *
 * `ts.TypeFlags` is an internal TypeScript enum whose numeric values are not
 * part of the public API contract. The TypeScript team has reshuffled the
 * enum across major versions — most recently between TS 5.x and TS 6.x:
 *
 * | Flag             | TS 5.x value | TS 6.x value |
 * | ---------------- | ------------ | ------------ |
 * | `Null`           | 65536        | 8            |
 * | `Undefined`      | 32768        | 4            |
 * | `String`         | 4            | 32           |
 * | `Number`         | 8            | 64           |
 * | `Boolean`        | 16           | 256          |
 * | `StringLiteral`  | 128          | 1024         |
 * | `NumberLiteral`  | 256          | 2048         |
 * | `BooleanLiteral` | 512          | 8192         |
 * | `BigInt`         | 64           | 128          |
 * | `BigIntLiteral`  | 2048         | 4096         |
 * | `Object`         | 524288       | (changed)    |
 *
 * If these checks are written with hardcoded numeric literals (e.g.
 * `type.flags & 65536`), they pass under one TS major and silently produce
 * wrong answers under another — `type.flags & 65536` matches an unrelated
 * flag in TS 6, so an `isNullableType` that returned `true` under TS 5
 * silently returns `false` under TS 6. The cascading effect on rule
 * `messageId`s is invisible to type-checking and only caught by tests.
 *
 * ### The rule
 *
 * Always reference flags by enum member: `type.flags & ts.TypeFlags.Null`
 * — never by literal value. The `import * as ts from "typescript"` in this
 * module (rather than `import type ts`) is intentional: it gives us the
 * runtime enum object whose values are correct for whichever TS version the
 * host project resolves. `typescript` is already a peer-dep of this package,
 * so this adds no install-size cost.
 *
 * If a future TS major reshuffles `TypeFlags` again, the enum-reference
 * form keeps working with no code changes; the literal form would need a
 * full audit and likely silently break consumers.
 *
 * ### What to do if you find a hardcoded flag number
 *
 * Replace it with the equivalent `ts.TypeFlags.X` reference. If you're
 * unsure which name corresponds to a number, check `node_modules/typescript/lib/typescript.d.ts`
 * — the enum member names are stable across versions even when the
 * numeric values shift.
 *
 * @see https://github.com/microsoft/TypeScript — `TypeFlags` enum definition
 *      lives in `src/compiler/types.ts` of the TypeScript repository
 */

import type { ParserServicesWithTypeInformation } from "@typescript-eslint/utils";
import type { TSESTree } from "@typescript-eslint/utils";
import * as ts from "typescript";

/**
 * Field type categories for FormSpec.
 *
 * @public
 */
export type FieldTypeCategory =
  | "string"
  | "number"
  | "bigint"
  | "boolean"
  | "array"
  | "object"
  | "union"
  | "unknown";

function isIntersectionWithBase(type: ts.Type, predicate: (member: ts.Type) => boolean): boolean {
  return type.isIntersection() && type.types.some((member) => predicate(member));
}

/**
 * Checks if a TypeScript type is a string type.
 *
 * Handles string primitives, string literals, and unions of string types.
 *
 * @param type - The TypeScript type to check
 * @param checker - The TypeScript type checker instance
 * @returns True if the type is string, a string literal, or a union of string types
 *
 * @public
 */
export function isStringType(
  type: ts.Type,
  checker: ts.TypeChecker,
  seen = new Set<ts.Type>()
): boolean {
  const stripped = stripNullishFromUnion(type);
  if (seen.has(stripped)) {
    return false;
  }
  seen.add(stripped);

  // Check for string primitive
  if (stripped.flags & ts.TypeFlags.String) {
    return true;
  }

  // Check for string literal
  if (stripped.flags & ts.TypeFlags.StringLiteral) {
    return true;
  }

  // Check for union of string literals (e.g., "a" | "b")
  if (stripped.isUnion()) {
    return stripped.types.every((t) => isStringType(t, checker, seen));
  }

  if (isIntersectionWithBase(stripped, (t) => isStringType(t, checker, seen))) {
    return true;
  }

  const baseConstraint = checker.getBaseConstraintOfType(stripped);
  if (baseConstraint !== undefined && baseConstraint !== stripped) {
    return isStringType(baseConstraint, checker, seen);
  }

  return false;
}

function isNumberTypeInner(type: ts.Type, checker: ts.TypeChecker, seen: Set<ts.Type>): boolean {
  const stripped = stripNullishFromUnion(type);
  if (seen.has(stripped)) {
    return false;
  }
  seen.add(stripped);

  if (stripped.flags & ts.TypeFlags.Number) {
    return true;
  }

  if (stripped.flags & ts.TypeFlags.NumberLiteral) {
    return true;
  }

  if (stripped.isUnion()) {
    return stripped.types.every((t) => isNumberTypeInner(t, checker, seen));
  }

  if (isIntersectionWithBase(stripped, (t) => isNumberTypeInner(t, checker, seen))) {
    return true;
  }

  const baseConstraint = checker.getBaseConstraintOfType(stripped);
  if (baseConstraint !== undefined && baseConstraint !== stripped) {
    return isNumberTypeInner(baseConstraint, checker, seen);
  }

  return false;
}

/**
 * Checks if a TypeScript type is a number type.
 *
 * Handles number primitives, number literals, unions of number types, and
 * branded intersections whose numeric member is a number type.
 *
 * @param type - The TypeScript type to check
 * @param checker - The TypeScript type checker instance
 * @returns True if the type is number, a number literal, a union of number
 * types, or an intersection containing a number type
 *
 * @public
 */
export function isNumberType(type: ts.Type, checker: ts.TypeChecker): boolean {
  return isNumberTypeInner(type, checker, new Set<ts.Type>());
}

function isBigIntTypeInner(type: ts.Type, seen: Set<ts.Type>): boolean {
  const stripped = stripNullishFromUnion(type);
  if (seen.has(stripped)) {
    return false;
  }
  seen.add(stripped);

  if (stripped.flags & ts.TypeFlags.BigInt) {
    return true;
  }

  if (stripped.flags & ts.TypeFlags.BigIntLiteral) {
    return true;
  }

  if (stripped.isUnion()) {
    return stripped.types.every((t) => isBigIntTypeInner(t, seen));
  }

  return isIntersectionWithBase(stripped, (t) => isBigIntTypeInner(t, seen));
}

/**
 * Checks if a TypeScript type is a bigint type.
 *
 * @public
 */
export function isBigIntType(type: ts.Type): boolean {
  return isBigIntTypeInner(type, new Set<ts.Type>());
}

function isBooleanTypeInner(type: ts.Type, checker: ts.TypeChecker, seen: Set<ts.Type>): boolean {
  const stripped = stripNullishFromUnion(type);
  if (seen.has(stripped)) {
    return false;
  }
  seen.add(stripped);

  if (stripped.flags & ts.TypeFlags.Boolean) {
    return true;
  }

  if (stripped.flags & ts.TypeFlags.BooleanLiteral) {
    return true;
  }

  if (stripped.isUnion()) {
    return stripped.types.every((t) => isBooleanTypeInner(t, checker, seen));
  }

  if (isIntersectionWithBase(stripped, (t) => isBooleanTypeInner(t, checker, seen))) {
    return true;
  }

  const baseConstraint = checker.getBaseConstraintOfType(stripped);
  if (baseConstraint !== undefined && baseConstraint !== stripped) {
    return isBooleanTypeInner(baseConstraint, checker, seen);
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
 *
 * @public
 */
export function isBooleanType(type: ts.Type, checker: ts.TypeChecker): boolean {
  return isBooleanTypeInner(type, checker, new Set<ts.Type>());
}

/**
 * Checks whether a type includes `null` or `undefined`.
 */
export function isNullableType(type: ts.Type): boolean {
  if (!type.isUnion()) {
    return (type.flags & ts.TypeFlags.Null) !== 0 || (type.flags & ts.TypeFlags.Undefined) !== 0;
  }

  return type.types.some((t) => isNullableType(t));
}

/**
 * Checks if a TypeScript type is an array type.
 *
 * Handles Array<T>, T[], and readonly arrays.
 *
 * @param type - The TypeScript type to check
 * @param checker - The TypeScript type checker instance
 * @returns True if the type is an array type
 *
 * @public
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
 * Strips `undefined` and `null` from a union type.
 *
 * Optional fields (`field?: string`) have type `string | undefined`. This
 * function returns the non-nullish part so that type categorization works
 * correctly for optional fields.
 *
 * If the type is not a union or all constituents are nullish, returns the
 * original type unchanged.
 */
function stripNullishFromUnion(type: ts.Type): ts.Type {
  if (!type.isUnion()) return type;

  const nonNullish = type.types.filter(
    (t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null))
  );

  if (nonNullish.length === 0) return type;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length check above guarantees element exists
  if (nonNullish.length === 1) return nonNullish[0]!;

  // Still a union after stripping — return original (union categorization applies)
  return type;
}

/**
 * Determines the field type category from a TypeScript type.
 *
 * Categories help determine which constraint tags are valid for a field.
 *
 * @param type - The TypeScript type to categorize
 * @param checker - The TypeScript type checker instance
 * @returns The field type category
 *
 * @public
 */
export function getFieldTypeCategory(type: ts.Type, checker: ts.TypeChecker): FieldTypeCategory {
  // Strip undefined/null from union types (e.g., optional fields: string | undefined → string)
  const stripped = stripNullishFromUnion(type);

  if (isStringType(stripped, checker)) return "string";
  if (isNumberType(stripped, checker)) return "number";
  if (isBigIntType(stripped)) return "bigint";
  if (isBooleanType(stripped, checker)) return "boolean";
  if (isArrayType(stripped, checker)) return "array";

  // Check for object types (but not arrays)
  if (stripped.flags & ts.TypeFlags.Object) {
    return "object";
  }

  // Check for unions that aren't all strings/numbers
  if (stripped.isUnion()) {
    return "union";
  }

  return "unknown";
}

/**
 * Gets the TypeScript type of a class property.
 *
 * @public
 */
export function getPropertyType(
  node: TSESTree.PropertyDefinition | TSESTree.TSPropertySignature,
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
 * Gets the type checker from parser services.
 */
export function getTypeChecker(services: ParserServicesWithTypeInformation): ts.TypeChecker {
  return services.program.getTypeChecker();
}

/**
 * Converts a TypeScript type to a readable string.
 */
export function typeToString(type: ts.Type, checker: ts.TypeChecker): string {
  return checker.typeToString(type);
}
