/**
 * Symbol-based custom type registry.
 *
 * Walks the FormSpec config file AST to find `defineCustomType<T>()` calls,
 * extracts the TypeScript type argument, resolves it to a canonical `ts.Symbol`,
 * and builds a `Map` for O(1) symbol-identity lookup during field analysis.
 *
 * This detection path is the most precise available — it uses TypeScript's own
 * type identity, making it immune to import aliases and name collisions.
 *
 * @packageDocumentation
 */

import * as ts from "typescript";
import type { ExtensionRegistry, ExtensionTypeLookupResult } from "./registry.js";

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * Walks the config file's AST to find `defineCustomType<T>()` calls,
 * extracts type arguments, resolves them to ts.Symbol, and builds a
 * Map for O(1) symbol-identity lookup during field analysis.
 *
 * Returns an empty map if the config file isn't in the program, has
 * no `defineCustomType` calls, or none have type arguments.
 *
 * @param configPath - Absolute path to the FormSpec config file.
 * @param program - The TypeScript program that includes the config file.
 * @param checker - Type checker for the program.
 * @param extensionRegistry - The runtime extension registry already built from
 *   the config's export; used to look up the matching registration by typeName.
 * @returns A map from canonical ts.Symbol to the matching registry entry.
 *
 * @public
 */
export function buildSymbolMapFromConfig(
  configPath: string,
  program: ts.Program,
  checker: ts.TypeChecker,
  extensionRegistry: ExtensionRegistry
): Map<ts.Symbol, ExtensionTypeLookupResult> {
  const symbolMap = new Map<ts.Symbol, ExtensionTypeLookupResult>();

  const configFile = program.getSourceFile(configPath);
  if (configFile === undefined) {
    return symbolMap;
  }

  // Walk AST to find defineCustomType<T>() calls
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && isDefineCustomTypeCall(node, checker)) {
      processDefineCustomTypeCall(node);
    }
    ts.forEachChild(node, visit);
  }

  function processDefineCustomTypeCall(call: ts.CallExpression): void {
    // typeArguments is checked (length > 0) before calling this function,
    // but the NodeArray index returns T | undefined in noUncheckedIndexedAccess mode.
    const typeArgNode = call.typeArguments?.[0];
    if (typeArgNode === undefined) {
      return;
    }
    const resolvedType = checker.getTypeFromTypeNode(typeArgNode);

    // Resolve to the canonical symbol, following alias chains.
    const canonical = resolveCanonicalSymbol(resolvedType, checker);
    if (canonical === undefined) {
      // Bare primitive (string, number, etc.) — no symbol, skip.
      return;
    }

    // Extract the typeName from the call's object literal argument so we can
    // look up the matching runtime registration by name.
    const typeName = extractTypeNameFromCallArg(call);
    if (typeName === null) {
      return;
    }

    // Look up the registration by typeName in the runtime registry.
    const entry = findRegistrationByTypeName(extensionRegistry, typeName);
    if (entry === undefined) {
      return;
    }

    symbolMap.set(canonical, entry);
  }

  visit(configFile);
  return symbolMap;
}

// =============================================================================
// HELPERS (module-private)
// =============================================================================

/**
 * Returns true when `node` is a `defineCustomType<T>(...)` call expression, regardless
 * of how `defineCustomType` was imported (direct import, namespace import, or renamed import).
 *
 * Primary strategy: resolve the call expression's symbol through the type checker and
 * verify the declaration comes from `@formspec/core`. This handles namespace imports
 * (`core.defineCustomType<T>()`), renamed imports (`dct<T>()`), and re-exports.
 *
 * Fallback strategy: if the type checker cannot resolve the symbol (e.g., when the
 * config file's module resolution cannot locate `@formspec/core` from its directory),
 * fall back to a syntactic check on the bare identifier name. This covers the common
 * case of `import { defineCustomType } from "@formspec/core"` in environments where
 * type-checker-based symbol resolution is unavailable.
 */
function isDefineCustomTypeCall(node: ts.CallExpression, checker: ts.TypeChecker): boolean {
  if (node.typeArguments === undefined || node.typeArguments.length === 0) return false;

  const callSymbol = checker.getSymbolAtLocation(node.expression);
  if (callSymbol !== undefined) {
    // Primary path: symbol resolved — verify it's defineCustomType from @formspec/core.
    const resolved =
      callSymbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(callSymbol) : callSymbol;

    const decl = resolved.declarations?.[0];
    if (decl !== undefined) {
      // Normalize to forward slashes for cross-platform path comparison.
      const sourceFile = decl.getSourceFile().fileName.replace(/\\/g, "/");
      return (
        resolved.name === "defineCustomType" &&
        // Match whether in node_modules/@formspec/core or monorepo packages/core.
        (sourceFile.includes("@formspec/core") || sourceFile.includes("/packages/core/"))
      );
    }
  }

  // Fallback path: type checker couldn't resolve the symbol. Fall back to a syntactic
  // check on the bare identifier name so that
  // `import { defineCustomType } from "@formspec/core"` still works when
  // @formspec/core is not resolvable from the config file's directory.
  return ts.isIdentifier(node.expression) && node.expression.text === "defineCustomType";
}

/**
 * Resolves a TypeScript type to its canonical `ts.Symbol`, following alias chains.
 *
 * `aliasSymbol` tracks type aliases (e.g. `type Foo = Bar`); `getSymbol()` tracks
 * the structural symbol. We prefer `aliasSymbol` when present so that aliased types
 * resolve to the declaration site rather than the structural shape.
 *
 * Returns `undefined` for bare primitives and anonymous types, which have no symbol.
 */
function resolveCanonicalSymbol(type: ts.Type, checker: ts.TypeChecker): ts.Symbol | undefined {
  const raw = type.aliasSymbol ?? type.getSymbol();
  if (raw === undefined) return undefined;
  return raw.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(raw) : raw;
}

/**
 * Extracts the `typeName` string from a `defineCustomType({ typeName: "..." })` call.
 *
 * Returns `null` when the first argument is not an object literal or the
 * `typeName` property is missing / not a string literal.
 */
function extractTypeNameFromCallArg(call: ts.CallExpression): string | null {
  const arg = call.arguments[0];
  if (arg === undefined || !ts.isObjectLiteralExpression(arg)) {
    return null;
  }

  const typeNameProp = arg.properties.find(
    (p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "typeName"
  );

  if (typeNameProp === undefined || !ts.isStringLiteral(typeNameProp.initializer)) {
    return null;
  }

  return typeNameProp.initializer.text;
}

/**
 * Finds the registry entry for the extension type that matches `typeName`.
 *
 * Iterates extensions in registration order. Returns `undefined` if no
 * extension has a type with the given name.
 */
function findRegistrationByTypeName(
  registry: ExtensionRegistry,
  typeName: string
): ExtensionTypeLookupResult | undefined {
  for (const ext of registry.extensions) {
    if (ext.types === undefined) {
      continue;
    }
    for (const type of ext.types) {
      if (type.typeName === typeName) {
        return { extensionId: ext.extensionId, registration: type };
      }
    }
  }
  return undefined;
}
