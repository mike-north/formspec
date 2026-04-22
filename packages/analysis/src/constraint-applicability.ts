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
 *   2. This check runs BEFORE the typed-parser Role-C call (matching the build
 *      path's guard order). For a bad-arg AND wrong-type input (e.g. `@minimum
 *      "hello" on string`), Role B emits TYPE_MISMATCH before Role C inspects
 *      the argument — ensuring both consumers produce the same diagnostic code.
 *
 * @internal
 */

import * as ts from "typescript";
import { type SemanticCapability } from "./tag-registry.js";
import { hasTypeSemanticCapability } from "./ts-binding.js";

/**
 * Maps a {@link SemanticCapability} to a human-readable type name for use in
 * diagnostic messages (e.g. `"numeric-comparable"` → `"number"`).
 *
 * Both the build consumer (`tsdoc-parser.ts`) and the snapshot consumer
 * (`file-snapshots.ts`) use this helper so their TYPE_MISMATCH messages are
 * identical.
 *
 * @internal
 */
export function _capabilityLabel(capability: SemanticCapability | undefined): string {
  switch (capability) {
    case "numeric-comparable":
      return "number";
    case "string-like":
      return "string";
    case "array-like":
      return "array";
    case "enum-member-addressable":
      return "enum";
    case "json-like":
      return "JSON-compatible";
    case "object-like":
      return "object";
    case "condition-like":
      return "conditional";
    case undefined:
      return "compatible";
    default: {
      // Exhaustiveness guard: if a new SemanticCapability is added to the
      // union, TypeScript will error here until this switch is updated.
      const exhaustive: never = capability;
      return String(exhaustive);
    }
  }
}

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
 *
 * @internal
 */
export function _supportsConstraintCapability(
  capability: SemanticCapability | undefined,
  fieldType: ts.Type,
  checker: ts.TypeChecker
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
 * array.
 */
function getArrayElementType(type: ts.Type, checker: ts.TypeChecker): ts.Type | null {
  if (!checker.isArrayType(type)) {
    return null;
  }
  // checker.isArrayType guarantees TypeReference here.
  return checker.getTypeArguments(type as ts.TypeReference)[0] ?? null;
}
