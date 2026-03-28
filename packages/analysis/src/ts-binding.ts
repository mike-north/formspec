import * as ts from "typescript";
import type { FormSpecPlacement, SemanticCapability } from "./tag-registry.js";

export type FormSpecSemanticCapability = SemanticCapability;

function stripNullishUnion(type: ts.Type): ts.Type {
  if (!type.isUnion()) {
    return type;
  }

  const nonNullish = type.types.filter(
    (member) => (member.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) === 0
  );
  if (nonNullish.length === 1 && nonNullish[0] !== undefined) {
    return nonNullish[0];
  }

  return type;
}

function isIntersectionWithBase(type: ts.Type, predicate: (member: ts.Type) => boolean): boolean {
  return type.isIntersection() && type.types.some((member) => predicate(member));
}

function isNumberLike(type: ts.Type): boolean {
  const stripped = stripNullishUnion(type);
  if (
    stripped.flags &
    (ts.TypeFlags.Number |
      ts.TypeFlags.NumberLiteral |
      ts.TypeFlags.BigInt |
      ts.TypeFlags.BigIntLiteral)
  ) {
    return true;
  }

  if (stripped.isUnion()) {
    return stripped.types.every((member) => isNumberLike(member));
  }

  return isIntersectionWithBase(stripped, isNumberLike);
}

function isStringLike(type: ts.Type): boolean {
  const stripped = stripNullishUnion(type);
  if (stripped.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral)) {
    return true;
  }

  if (stripped.isUnion()) {
    return stripped.types.every((member) => isStringLike(member));
  }

  return isIntersectionWithBase(stripped, isStringLike);
}

function isBooleanLike(type: ts.Type): boolean {
  const stripped = stripNullishUnion(type);
  if (stripped.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) {
    return true;
  }

  if (stripped.isUnion()) {
    return stripped.types.every((member) => isBooleanLike(member));
  }

  return isIntersectionWithBase(stripped, isBooleanLike);
}

function isArrayLike(type: ts.Type, checker: ts.TypeChecker): boolean {
  const stripped = stripNullishUnion(type);
  if (checker.isArrayType(stripped)) {
    return true;
  }

  const symbol = stripped.getSymbol();
  return symbol?.name === "Array" || symbol?.name === "ReadonlyArray";
}

function isStringLiteralUnion(type: ts.Type): boolean {
  const stripped = stripNullishUnion(type);
  return stripped.isUnion() && stripped.types.length > 0 && stripped.types.every(isStringLike);
}

function isObjectLike(type: ts.Type, checker: ts.TypeChecker): boolean {
  const stripped = stripNullishUnion(type);
  return !isArrayLike(stripped, checker) && (stripped.flags & ts.TypeFlags.Object) !== 0;
}

export function resolveDeclarationPlacement(node: ts.Node): FormSpecPlacement | null {
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isPropertyDeclaration(node)) return "class-field";
  if (ts.isMethodDeclaration(node)) return "class-method";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isPropertySignature(node)) return "interface-field";
  if (ts.isTypeAliasDeclaration(node)) return "type-alias";
  if (ts.isVariableDeclaration(node)) return "variable";
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isParameter(node)) {
    if (ts.isMethodDeclaration(node.parent) || ts.isConstructorDeclaration(node.parent)) {
      return "method-parameter";
    }
    return "function-parameter";
  }
  return null;
}

export function getTypeSemanticCapabilities(
  type: ts.Type,
  checker: ts.TypeChecker
): readonly SemanticCapability[] {
  const capabilities = new Set<SemanticCapability>();

  if (isNumberLike(type)) {
    capabilities.add("numeric-comparable");
  }
  if (isStringLike(type)) {
    capabilities.add("string-like");
  }
  if (isBooleanLike(type)) {
    capabilities.add("json-like");
  }
  if (isArrayLike(type, checker)) {
    capabilities.add("array-like");
    capabilities.add("json-like");
  }
  if (isStringLiteralUnion(type)) {
    capabilities.add("enum-member-addressable");
  }
  if (isObjectLike(type, checker)) {
    capabilities.add("object-like");
    capabilities.add("json-like");
  }

  return [...capabilities];
}

export function hasTypeSemanticCapability(
  type: ts.Type,
  checker: ts.TypeChecker,
  capability: SemanticCapability
): boolean {
  return getTypeSemanticCapabilities(type, checker).includes(capability);
}

function collectPropertyPaths(
  type: ts.Type,
  checker: ts.TypeChecker,
  capability: SemanticCapability,
  prefix: readonly string[],
  visited: Set<ts.Type>
): string[] {
  const stripped = stripNullishUnion(type);
  if (visited.has(stripped)) {
    return [];
  }
  visited.add(stripped);

  const suggestions: string[] = [];

  if (hasTypeSemanticCapability(stripped, checker, capability) && prefix.length > 0) {
    suggestions.push(prefix.join("."));
  }

  for (const property of stripped.getProperties()) {
    const declaration = property.valueDeclaration ?? property.declarations?.[0];
    if (declaration === undefined) {
      continue;
    }

    const propertyType = checker.getTypeOfSymbolAtLocation(property, declaration);
    const nextPrefix = [...prefix, property.name];
    suggestions.push(
      ...collectPropertyPaths(propertyType, checker, capability, nextPrefix, visited)
    );
  }

  return suggestions;
}

export function collectCompatiblePathTargets(
  type: ts.Type,
  checker: ts.TypeChecker,
  capability: SemanticCapability
): readonly string[] {
  return collectPropertyPaths(type, checker, capability, [], new Set<ts.Type>());
}
