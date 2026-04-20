import * as ts from "typescript";

/**
 * Collects all brand identifier texts from an intersection type's computed
 * property names.
 *
 * Walks the type's properties looking for computed property names backed by
 * plain identifiers — the standard `unique symbol` brand pattern. Returns all
 * matching identifiers so types with multiple brands (e.g.,
 * `number & { [__integerBrand]: true } & { [__otherBrand]: true }`) are fully
 * inspected regardless of property order.
 */
function collectBrandIdentifiers(type: ts.Type): readonly string[] {
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
 * Returns `true` when `type` is an integer-branded intersection — i.e., it
 * includes a `number` base and a computed property keyed by `__integerBrand`.
 *
 * Used by both the build consumer (`tsdoc-parser.ts`) and the snapshot consumer
 * (`file-snapshots.ts`) to bypass the synthetic-checker constraint path for
 * imported types whose names the synthetic program cannot resolve.
 *
 * Call `stripNullishUnion` (re-exported from `@formspec/analysis/internal`)
 * before this function to handle nullable and optional fields
 * (e.g. `MultiBrandedInteger | null`).
 *
 * @internal
 */
export function isIntegerBrandedType(type: ts.Type): boolean {
  if (!type.isIntersection()) return false;
  if (!type.types.some((member) => !!(member.flags & ts.TypeFlags.Number))) return false;
  return collectBrandIdentifiers(type).includes("__integerBrand");
}
