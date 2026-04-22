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
import type { JsonValue } from "@formspec/core/internals";
import { type SemanticCapability } from "./tag-registry.js";
import { hasTypeSemanticCapability, stripNullishUnion } from "./ts-binding.js";

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
 * Ported from `supportsConstraintCapability` in `tsdoc-parser.ts` (build
 * package). Both the build consumer (`tsdoc-parser.ts`) and the snapshot
 * consumer (`file-snapshots.ts`) call this function, so the capability
 * logic is shared and the TYPE_MISMATCH decisions are consistent across
 * both paths.
 *
 * Behaviour:
 * - When `capability` is `undefined` (no constraint on target type), returns
 *   `true` unconditionally.
 * - For `string-like` capability, also accepts `string[]` (and nullable
 *   variants like `string[] | null`) by unwrapping the array element type.
 *   This mirrors the build path's treatment of `@pattern` on string-array
 *   fields.
 * - Integer-brand bypass is the caller's responsibility. Callers must check
 *   for integer-branded types and skip this function when appropriate (see
 *   ordering invariants in the module-level JSDoc). There is no options
 *   parameter — the bypass happens at the call site, not here.
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
 *
 * Applies {@link stripNullishUnion} before the array check so that nullable
 * array types (e.g. `string[] | null`) are correctly unwrapped. Without this,
 * `checker.isArrayType` returns `false` for the union type, causing nullable
 * array fields to silently fail Role-B capability checks.
 */
function getArrayElementType(type: ts.Type, checker: ts.TypeChecker): ts.Type | null {
  const stripped = stripNullishUnion(type);
  if (!checker.isArrayType(stripped)) {
    return null;
  }
  // checker.isArrayType guarantees TypeReference here.
  return checker.getTypeArguments(stripped as ts.TypeReference)[0] ?? null;
}

/**
 * Primitive kinds recognized by `@const` value/type validation.
 *
 * Mirrors the build path's `effectiveType.primitiveKind` set in
 * `semantic-targets.ts` `case "const":` (~line 1255). The snapshot consumer
 * does not build a TypeNode IR — we classify the `ts.Type` directly from
 * `TypeFlags` instead.
 */
type ConstPrimitiveKind = "string" | "number" | "integer" | "bigint" | "boolean" | "null";

/**
 * Classifies a `ts.Type` for `@const` value/type validation.
 *
 * Mirrors the build path's kind classification in `semantic-targets.ts`
 * `case "const":` (~line 1255). The snapshot consumer has no TypeNode IR, so
 * we inspect the `ts.Type` via `TypeFlags` and enum detection directly.
 *
 * Nullish-union members (`T | null | undefined`) are stripped first — matching
 * `getArrayElementType`'s treatment and the Role-B capability check. A
 * nullable `number | null` field classifies as `"number"`; the `null` member
 * does not demote it to `"other"`.
 *
 * Returns:
 * - `{ kind: "primitive"; primitiveKind }` — plain primitive types. `integer`
 *   is NOT detected here (there is no TS-level "integer" flag); callers that
 *   need integer-brand treatment should bypass this function via
 *   `_isIntegerBrandedType` before calling.
 * - `{ kind: "enum"; members }` — string-literal unions. Member values are
 *   returned in declaration order (matches `getEnumMemberCompletions` but
 *   without sorting, since `jsonValueEquals` is order-independent).
 * - `{ kind: "other" }` — anything else (structs, arrays, unions of mixed
 *   types, etc.). The caller should emit the placement error.
 *
 * @internal
 */
function classifyConstTargetType(
  type: ts.Type
):
  | { readonly kind: "primitive"; readonly primitiveKind: ConstPrimitiveKind }
  | { readonly kind: "enum"; readonly members: readonly string[] }
  | { readonly kind: "other" } {
  const stripped = stripNullishUnion(type);

  // String-literal union → enum. Matches the analysis-IR `enum` type the build
  // path checks against in semantic-targets.ts case "const".
  if (stripped.isUnion() && stripped.types.length > 0) {
    const memberLiterals: string[] = [];
    let allStringLiterals = true;
    for (const member of stripped.types) {
      if (member.isStringLiteral()) {
        memberLiterals.push(member.value);
      } else {
        allStringLiterals = false;
        break;
      }
    }
    if (allStringLiterals) {
      return { kind: "enum", members: memberLiterals };
    }
  }

  // Plain string (or a single string literal).
  if (stripped.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral)) {
    return { kind: "primitive", primitiveKind: "string" };
  }

  // Number (regular number or numeric literal).
  if (stripped.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) {
    return { kind: "primitive", primitiveKind: "number" };
  }

  // BigInt — the build path treats `bigint` as primitiveKind "bigint".
  if (stripped.flags & (ts.TypeFlags.BigInt | ts.TypeFlags.BigIntLiteral)) {
    return { kind: "primitive", primitiveKind: "bigint" };
  }

  // Boolean.
  if (stripped.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) {
    return { kind: "primitive", primitiveKind: "boolean" };
  }

  // Null.
  if (stripped.flags & ts.TypeFlags.Null) {
    return { kind: "primitive", primitiveKind: "null" };
  }

  return { kind: "other" };
}

/**
 * Type guard: value is a JSON array.
 */
function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

/**
 * Type guard: value is a JSON object (non-null, non-array).
 */
function isJsonObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-equality check for two JSON values.
 *
 * Mirrors `jsonValueEquals` in `semantic-targets.ts` (~line 459). Extracted as
 * a local helper here so the snapshot consumer's `@const` IR check does not
 * depend on the `semantic-targets.ts` internals (which are build-path
 * machinery). The two implementations should stay behaviourally identical.
 */
function jsonValueEquals(left: JsonValue, right: JsonValue): boolean {
  if (left === right) {
    return true;
  }

  if (isJsonArray(left) || isJsonArray(right)) {
    if (!isJsonArray(left) || !isJsonArray(right) || left.length !== right.length) {
      return false;
    }
    for (const [index, leftItem] of left.entries()) {
      const rightItem = right[index];
      if (rightItem === undefined || !jsonValueEquals(leftItem, rightItem)) {
        return false;
      }
    }
    return true;
  }

  if (isJsonObject(left) || isJsonObject(right)) {
    if (!isJsonObject(left) || !isJsonObject(right)) {
      return false;
    }
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    return leftKeys.every((key, index) => {
      if (rightKeys[index] !== key) {
        return false;
      }
      const leftValue = left[key];
      const rightValue = right[key];
      return (
        leftValue !== undefined &&
        rightValue !== undefined &&
        jsonValueEquals(leftValue, rightValue)
      );
    });
  }

  return false;
}

/**
 * Classifies the runtime `typeof` of a JSON value for `@const` value/type
 * matching.
 *
 * Mirrors the build path's value-type labelling in `semantic-targets.ts`
 * `case "const":` (~line 1273):
 *   - `null` → `"null"`
 *   - `Array` → `"array"`
 *   - otherwise → `typeof value`
 */
function constValueTypeLabel(value: JsonValue): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

/**
 * Human-readable label for a field type in `@const` placement diagnostics.
 *
 * The build path renders `effectiveType` via `renderTypeLabel` in
 * `semantic-targets.ts`. The snapshot consumer uses `checker.typeToString`
 * as the closest equivalent. Caller may pass a pre-rendered string (e.g.
 * `standaloneSubjectTypeText`) to preserve existing formatting.
 */
function renderFieldTypeLabel(type: ts.Type, checker: ts.TypeChecker): string {
  return checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation);
}

/**
 * Validates an `@const` tag's value against the field type.
 *
 * Ports the three sub-checks from `semantic-targets.ts` `case "const":`
 * (~lines 1255-1301) to the snapshot consumer path. The build path validates
 * `@const` at IR validation time (on `effectiveType`); the snapshot consumer
 * does not build an IR, so this helper performs the equivalent checks
 * directly against a `ts.Type`.
 *
 * Returns a TYPE_MISMATCH descriptor when any check fails, or `null` when the
 * value is compatible with the field type. The returned object is shaped so
 * callers can push it into their diagnostic array without re-deriving the
 * code/message pair.
 *
 * Checks (in order):
 *   1. **Placement.** Field type must be a primitive (`string`, `number`,
 *      `bigint`, `boolean`, `null`) or a string-literal enum. Otherwise:
 *      `constraint "const" is only valid on primitive or enum fields, but
 *      field type is "<label>"`.
 *   2. **Primitive value-type match.** For a primitive field, the value's
 *      runtime `typeof` (with `null`/`Array` carve-outs) must match the
 *      primitive kind. `integer` and `bigint` both accept `"number"` — but
 *      note this helper does not classify `integer` itself (there is no
 *      TS-level flag); integer-branded types should bypass via
 *      `_isIntegerBrandedType` at the call site. If the types disagree:
 *      `@const value type "<valueType>" is incompatible with field type
 *      "<primitiveKind>"`.
 *   3. **Enum membership.** For an enum field, the value must deep-equal one
 *      member via {@link jsonValueEquals}. Otherwise: `@const value <JSON>
 *      is not one of the enum members`.
 *
 * Message prefixes match the build path VERBATIM (minus the `Field "<name>":`
 * prefix, which is added by the diagnostic-emission layer in the build path
 * but not by the snapshot consumer). This keeps the diagnostic-text story
 * consistent between the two consumers.
 *
 * @param value     - The parsed `@const` value.
 * @param fieldType - The TypeScript type of the field being annotated.
 * @param checker   - The TypeScript type checker for the host program.
 *
 * @internal
 */
export function _checkConstValueAgainstType(
  value: JsonValue,
  fieldType: ts.Type,
  checker: ts.TypeChecker
): { readonly code: "TYPE_MISMATCH"; readonly message: string } | null {
  const classification = classifyConstTargetType(fieldType);

  if (classification.kind === "other") {
    return {
      code: "TYPE_MISMATCH",
      message: `constraint "const" is only valid on primitive or enum fields, but field type is "${renderFieldTypeLabel(fieldType, checker)}"`,
    };
  }

  if (classification.kind === "primitive") {
    const valueType = constValueTypeLabel(value);
    const expectedValueType =
      classification.primitiveKind === "integer" || classification.primitiveKind === "bigint"
        ? "number"
        : classification.primitiveKind;
    if (valueType !== expectedValueType) {
      return {
        code: "TYPE_MISMATCH",
        message: `@const value type "${valueType}" is incompatible with field type "${classification.primitiveKind}"`,
      };
    }
    return null;
  }

  // enum case
  const memberMatches = classification.members.some((member) => jsonValueEquals(member, value));
  if (!memberMatches) {
    return {
      code: "TYPE_MISMATCH",
      message: `@const value ${JSON.stringify(value)} is not one of the enum members`,
    };
  }
  return null;
}
