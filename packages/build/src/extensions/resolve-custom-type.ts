import * as ts from "typescript";

import { collectBrandIdentifiers, stripNullishUnion } from "@formspec/analysis/internal";

import type { ExtensionRegistry, ExtensionTypeLookupResult } from "./registry.js";
import {
  extractTypeNodeFromSource,
  getTypeAliasDeclarationFromTypeReference,
  resolveCanonicalSymbol,
} from "./ts-type-utils.js";

function getTypeNodeRegistrationName(typeNode: ts.TypeNode): string | null {
  if (ts.isTypeReferenceNode(typeNode)) {
    return ts.isIdentifier(typeNode.typeName)
      ? typeNode.typeName.text
      : typeNode.typeName.right.text;
  }
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return getTypeNodeRegistrationName(typeNode.type);
  }
  if (
    typeNode.kind === ts.SyntaxKind.BigIntKeyword ||
    typeNode.kind === ts.SyntaxKind.StringKeyword ||
    typeNode.kind === ts.SyntaxKind.NumberKeyword ||
    typeNode.kind === ts.SyntaxKind.BooleanKeyword
  ) {
    return typeNode.getText();
  }
  return null;
}

function resolveByNameFromTypeNode(
  typeNode: ts.TypeNode,
  registry: ExtensionRegistry,
  checker: ts.TypeChecker
): ExtensionTypeLookupResult | null {
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return resolveByNameFromTypeNode(typeNode.type, registry, checker);
  }
  const typeName = getTypeNodeRegistrationName(typeNode);
  if (typeName !== null) {
    const byName = registry.findTypeByName(typeName);
    if (byName !== undefined) {
      return byName;
    }
  }
  if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
    const aliasDecl = getTypeAliasDeclarationFromTypeReference(typeNode, checker);
    if (aliasDecl !== undefined) {
      return resolveByNameFromTypeNode(aliasDecl.type, registry, checker);
    }
  }
  return null;
}

/**
 * Resolves a TypeScript type to an extension-registered custom type, trying
 * all three registration mechanisms in order of precision:
 *
 * 1. **Name-based** (via `sourceNode` AST walk) — matches the user-written
 *    alias identifier (e.g. `amount: Decimal` → `"Decimal"`). Requires a
 *    source node to walk; used by the direct-field code path.
 * 2. **Symbol-based** — matches `ts.Symbol` identity via
 *    `ExtensionRegistry.findTypeBySymbol`, populated from
 *    `defineCustomType<T>()` type parameter extraction. Works for any type
 *    regardless of import aliases or name collisions.
 * 3. **Brand-based** — matches the `brand` identifier encoded into
 *    intersection types as computed-property keys (e.g.
 *    `string & { [__decimalBrand]: true }`). Structural; independent of
 *    declaration names.
 *
 * Name-based resolution also has a symbol-fallback path that uses
 * `type.aliasSymbol?.getName()` when no `sourceNode` is provided, so
 * path-resolved types can still match name-registered custom types.
 *
 * Nullable unions (`T | null`, `T | undefined`, `T | null | undefined`) are
 * stripped before every detection attempt, so registrations apply through
 * nullable wrappers transparently.
 *
 * Returns `null` when no registered custom type matches.
 */
export function resolveCustomTypeFromTsType(
  type: ts.Type,
  checker: ts.TypeChecker,
  registry: ExtensionRegistry | undefined,
  sourceNode?: ts.Node
): ExtensionTypeLookupResult | null {
  if (registry === undefined) {
    return null;
  }

  const stripped = stripNullishUnion(type);

  // 1. Name-based: prefer walking the source AST for the user-written
  // identifier; fall back to the canonical symbol name for path-resolved
  // types that have no syntactic source.
  if (sourceNode !== undefined) {
    const typeNode = extractTypeNodeFromSource(sourceNode);
    if (typeNode !== undefined) {
      const byName = resolveByNameFromTypeNode(typeNode, registry, checker);
      if (byName !== null) {
        return byName;
      }
    }
  } else {
    const typeName = (stripped.aliasSymbol ?? stripped.getSymbol())?.getName();
    if (typeName !== undefined) {
      const byName = registry.findTypeByName(typeName);
      if (byName !== undefined) {
        return byName;
      }
    }
  }

  // 2. Symbol-based.
  const canonical = resolveCanonicalSymbol(stripped, checker);
  if (canonical !== undefined) {
    const bySymbol = registry.findTypeBySymbol(canonical);
    if (bySymbol !== undefined) {
      return bySymbol;
    }
  }

  // 3. Brand-based.
  for (const brand of collectBrandIdentifiers(stripped)) {
    const byBrand = registry.findTypeByBrand(brand);
    if (byBrand !== undefined) {
      return byBrand;
    }
  }

  return null;
}

/**
 * Returns the fully-qualified type ID for a resolved custom-type lookup.
 *
 * Type IDs have the form `${extensionId}/${typeName}`, matching the format
 * produced elsewhere in the build pipeline.
 */
export function customTypeIdFromLookup(result: ExtensionTypeLookupResult): string {
  return `${result.extensionId}/${result.registration.typeName}`;
}
