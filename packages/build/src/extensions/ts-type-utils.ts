import * as ts from "typescript";

/**
 * Collects all brand identifier texts from an intersection type's computed
 * property names.
 *
 * Walks `type.getProperties()` looking for computed property names backed
 * by plain identifiers — the standard `unique symbol` brand pattern. Returns
 * all matching identifiers so that types with multiple brands (e.g.,
 * `number & { [__integerBrand]: true } & { [__otherBrand]: true }`) are
 * fully inspected regardless of property order.
 */
export function collectBrandIdentifiers(type: ts.Type): readonly string[] {
  if (!type.isIntersection()) {
    return [];
  }
  const brands: string[] = [];
  for (const prop of type.getProperties()) {
    const decl = prop.valueDeclaration ?? prop.declarations?.[0];
    if (decl === undefined) continue;
    if (!ts.isPropertySignature(decl) && !ts.isPropertyDeclaration(decl)) continue;
    if (!ts.isComputedPropertyName(decl.name)) continue;
    if (!ts.isIdentifier(decl.name.expression)) continue;
    brands.push(decl.name.expression.text);
  }
  return brands;
}

/**
 * Resolves a TypeScript type to its canonical `ts.Symbol`, following alias chains.
 *
 * `aliasSymbol` tracks type aliases (e.g. `type Foo = Bar`); `getSymbol()` tracks
 * the structural symbol. We prefer `aliasSymbol` when present so that aliased
 * types resolve to the declaration site rather than the structural shape.
 *
 * Returns `undefined` for bare primitives and anonymous types, which have no
 * symbol.
 */
export function resolveCanonicalSymbol(
  type: ts.Type,
  checker: ts.TypeChecker
): ts.Symbol | undefined {
  const raw = type.aliasSymbol ?? type.getSymbol();
  if (raw === undefined) return undefined;
  return raw.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(raw) : raw;
}

/**
 * Extracts the `ts.TypeNode` backing a property / parameter / type-alias
 * declaration. Returns the node itself when `sourceNode` is already a type
 * node, or `undefined` otherwise.
 */
export function extractTypeNodeFromSource(sourceNode: ts.Node): ts.TypeNode | undefined {
  if (
    ts.isPropertyDeclaration(sourceNode) ||
    ts.isPropertySignature(sourceNode) ||
    ts.isParameter(sourceNode) ||
    ts.isTypeAliasDeclaration(sourceNode)
  ) {
    return sourceNode.type;
  }
  if (ts.isTypeNode(sourceNode)) {
    return sourceNode;
  }
  return undefined;
}

function resolveAliasedSymbol(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker
): ts.Symbol | undefined {
  if (symbol === undefined) return undefined;
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

/**
 * Resolves a `ts.TypeReferenceNode` to its declaring `ts.TypeAliasDeclaration`,
 * if the reference names a type alias — following import aliases so that
 * `import { Foo } from "./types"; field: Foo` resolves through to the
 * original `type Foo = ...` declaration.
 *
 * Returns `undefined` for references to non-alias declarations (interfaces,
 * classes, modules, etc.).
 */
export function getTypeAliasDeclarationFromTypeReference(
  typeNode: ts.TypeReferenceNode,
  checker: ts.TypeChecker
): ts.TypeAliasDeclaration | undefined {
  const symbol = checker.getSymbolAtLocation(typeNode.typeName);
  return resolveAliasedSymbol(symbol, checker)?.declarations?.find(ts.isTypeAliasDeclaration);
}
