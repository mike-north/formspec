import * as ts from "typescript";
import { collectBrandIdentifiers } from "../extensions/ts-type-utils.js";

/**
 * Returns `true` when `type` is an integer-branded intersection — i.e., it
 * includes a `number` base and a computed property keyed by `__integerBrand`.
 *
 * Used by both `class-analyzer.ts` (IR classification) and `tsdoc-parser.ts`
 * (constraint validation bypass for imported types whose names the synthetic
 * program cannot resolve).
 *
 * @internal
 */
export function isIntegerBrandedType(type: ts.Type): boolean {
  if (!type.isIntersection()) return false;
  if (!type.types.some((member) => !!(member.flags & ts.TypeFlags.Number))) return false;
  return collectBrandIdentifiers(type).includes("__integerBrand");
}
