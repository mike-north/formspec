/**
 * Constraint applicability guard — host-checker Role-B equivalent for the
 * snapshot consumer.
 *
 * The build consumer (`tsdoc-parser.ts`) calls `supportsConstraintCapability()`
 * before the synthetic-checker call to emit `TYPE_MISMATCH` when a constraint's
 * required semantic capability is absent from the field type (e.g. `@minimum 0`
 * on a `string` field has no `numeric-comparable` capability).
 *
 * This module ports that guard into `@formspec/analysis` so the snapshot
 * consumer can apply the same check without depending on the build package.
 *
 * Ordering invariants (for callers in `file-snapshots.ts:buildTagDiagnostics`):
 *   1. Integer-brand bypass MUST run before this check. Integer-branded types
 *      (`number & { [__integerBrand]: true }`) look like plain numbers for
 *      capability purposes but should bypass entirely (Phase 4A). If the brand
 *      bypass is not applied first, `_supportsConstraintCapability` will still
 *      return `true` for numeric-comparable on integer types (correct), but the
 *      guard ordering must match the build path's ordering.
 *   2. This check runs BEFORE the typed-parser Role-C call in the build path.
 *      In the snapshot consumer it should run after the typed-parser Role-C call
 *      (since Role C already ran earlier in the loop) but before the synthetic
 *      call.
 *
 * @internal
 */

import * as ts from "typescript";
import { type SemanticCapability } from "./tag-registry.js";
import { hasTypeSemanticCapability } from "./ts-binding.js";

/**
 * Returns `true` when `type` satisfies the constraint `capability`.
 *
 * Mirrors `supportsConstraintCapability` in `tsdoc-parser.ts` with one
 * addition: the `string-like` array-element unwrap path. This allows
 * `string[]` to satisfy `string-like` constraints (e.g. `@pattern`) by
 * inspecting the element type, consistent with the build path's behaviour.
 *
 * When `capability` is `undefined` (no constraint on target type), returns
 * `true` unconditionally.
 *
 * @param capability - The semantic capability required by the constraint tag.
 * @param fieldType  - The TypeScript type of the field being annotated.
 * @param checker    - The TypeScript type checker for the host program.
 * @param options    - Optional behaviour flags.
 * @param options.allowIntegerBrandedAsNumeric - Unused in this implementation
 *   because integer-brand bypass is handled by the caller before this function
 *   is invoked. Kept for API symmetry with the build path.
 *
 * @internal
 */
export function _supportsConstraintCapability(
  capability: SemanticCapability | undefined,
  fieldType: ts.Type,
  checker: ts.TypeChecker,
  _options?: { allowIntegerBrandedAsNumeric?: boolean }
): boolean {
  if (capability === undefined) {
    return true;
  }

  if (hasTypeSemanticCapability(fieldType, checker, capability)) {
    return true;
  }

  // Array-element unwrap for "string-like": `string[]` satisfies `string-like`
  // because the element type (`string`) does. This mirrors the build path's
  // `supportsConstraintCapability` in `tsdoc-parser.ts` (~line 464–468).
  if (capability === "string-like") {
    const itemType = getArrayElementType(fieldType, checker);
    return itemType !== null && hasTypeSemanticCapability(itemType, checker, capability);
  }

  return false;
}

/**
 * Returns the element type of an array type, or `null` if the type is not an
 * array. Strips nullish union members before checking.
 *
 * Mirrors the private `getArrayElementType` helper in `tsdoc-parser.ts`.
 */
function getArrayElementType(type: ts.Type, checker: ts.TypeChecker): ts.Type | null {
  if (!checker.isArrayType(type)) {
    return null;
  }
  return checker.getTypeArguments(type as ts.TypeReference)[0] ?? null;
}
