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
import { _isIntegerBrandedType } from "./integer-brand.js";
import { jsonValueEquals } from "./json-value.js";
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
 * Unlike {@link stripNullishUnion}, this classifier also handles *wider*
 * nullish unions internally: when a union contains `null`/`undefined` plus
 * multiple non-nullish members (e.g. `boolean | null`, `"USD" | "EUR" | null`),
 * `stripNullishUnion` leaves the union unchanged — but we still want to
 * classify the non-nullish portion. So we filter out nullish members and
 * inspect whatever remains.
 *
 * Returns:
 * - `{ kind: "primitive"; primitiveKind }` — plain primitive types, including
 *   integer-branded numeric intersections (detected via
 *   `_isIntegerBrandedType` to mirror the build path's `primitiveKind:
 *   "integer"`).
 * - `{ kind: "enum"; members }` — string-literal or number-literal unions, and
 *   single-literal types (a `"sent"` field becomes an enum-of-one, matching
 *   the build path's `isStringLiteral`/`isNumberLiteral` → IR `enum` mapping
 *   in `class-analyzer.ts`). Member values are returned in declaration order.
 * - `{ kind: "other" }` — anything else (structs, arrays, unions of mixed
 *   non-literal types, etc.). The caller should emit the placement error.
 *
 * @internal
 */
function classifyConstTargetType(
  type: ts.Type
):
  | { readonly kind: "primitive"; readonly primitiveKind: ConstPrimitiveKind }
  | { readonly kind: "enum"; readonly members: readonly (string | number)[] }
  | { readonly kind: "other" } {
  const stripped = stripNullishUnion(type);

  // Integer-branded intersection (`number & { [__integerBrand]: true }`) must
  // be detected BEFORE primitive-flag checks, because the intersection itself
  // has neither `TypeFlags.Number` nor any primitive flag in the shape we
  // care about. Mirrors the build path's integer primitive kind.
  if (_isIntegerBrandedType(stripped)) {
    return { kind: "primitive", primitiveKind: "integer" };
  }

  // If this is a union, filter out nullish members and reclassify on what
  // remains. This catches wider nullish unions (boolean | null,
  // "a" | "b" | null) that stripNullishUnion leaves untouched because they
  // have more than one non-nullish member.
  if (stripped.isUnion()) {
    const nonNullish = stripped.types.filter(
      (member) => (member.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) === 0
    );

    // If only one non-nullish member remains, recurse on it (handles cases
    // like `(true | false) | null` where the inner `true | false` is itself
    // the boolean widening target).
    if (nonNullish.length === 1 && nonNullish[0] !== undefined) {
      return classifyConstTargetType(nonNullish[0]);
    }

    if (nonNullish.length >= 1) {
      // String-literal union → enum (matches the analysis-IR `enum` type
      // the build path checks against in semantic-targets.ts case "const").
      // Number-literal union also produces enum-of-numbers, matching
      // class-analyzer's isNumberLiteral → enum mapping.
      const memberLiterals: (string | number)[] = [];
      let allStringLiterals = true;
      let allNumberLiterals = true;
      for (const member of nonNullish) {
        if (member.isStringLiteral()) {
          allNumberLiterals = false;
          memberLiterals.push(member.value);
        } else if (member.isNumberLiteral()) {
          allStringLiterals = false;
          memberLiterals.push(member.value);
        } else {
          allStringLiterals = false;
          allNumberLiterals = false;
          break;
        }
      }
      if (allStringLiterals || allNumberLiterals) {
        return { kind: "enum", members: memberLiterals };
      }

      // Boolean-wide union: `true | false` is how TS represents `boolean`
      // internally. If every non-nullish member has BooleanLiteral flag,
      // treat as primitive boolean.
      const allBooleanLiteral = nonNullish.every(
        (member) => (member.flags & ts.TypeFlags.BooleanLiteral) !== 0
      );
      if (allBooleanLiteral) {
        return { kind: "primitive", primitiveKind: "boolean" };
      }
    }
    // Fall through to the widened-primitive checks below; non-uniform
    // non-nullish unions (e.g. `string | number`) hit `{ kind: "other" }`.
  }

  // Single-literal types map to enum-of-one to match the build-path IR shape
  // (class-analyzer.ts maps isStringLiteral/isNumberLiteral to an enum node
  // with a single member). If we treated them as primitives here, a @const
  // value that fails enum-membership would incorrectly PASS the snapshot
  // check while the build check correctly rejects it.
  if (stripped.isStringLiteral()) {
    return { kind: "enum", members: [stripped.value] };
  }
  if (stripped.isNumberLiteral()) {
    return { kind: "enum", members: [stripped.value] };
  }

  // Plain string (non-literal).
  if ((stripped.flags & ts.TypeFlags.String) !== 0) {
    return { kind: "primitive", primitiveKind: "string" };
  }

  // Plain number (non-literal).
  if ((stripped.flags & ts.TypeFlags.Number) !== 0) {
    return { kind: "primitive", primitiveKind: "number" };
  }

  // BigInt — the build path treats `bigint` as primitiveKind "bigint".
  if ((stripped.flags & (ts.TypeFlags.BigInt | ts.TypeFlags.BigIntLiteral)) !== 0) {
    return { kind: "primitive", primitiveKind: "bigint" };
  }

  // Boolean (widened or literal).
  if ((stripped.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) !== 0) {
    return { kind: "primitive", primitiveKind: "boolean" };
  }

  // Null.
  if ((stripped.flags & ts.TypeFlags.Null) !== 0) {
    return { kind: "primitive", primitiveKind: "null" };
  }

  return { kind: "other" };
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
 * `semantic-targets.ts`. The snapshot consumer renders the provided
 * `ts.Type` via `checker.typeToString` as the closest equivalent.
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
 *      `integer`, `bigint`, `boolean`, `null`) or a string-literal enum.
 *      Otherwise: `constraint "const" is only valid on primitive or enum
 *      fields, but field type is "<label>"`.
 *   2. **Primitive value-type match.** For a primitive field, the value's
 *      runtime `typeof` (with `null`/`Array` carve-outs) must match the
 *      primitive kind. `classifyConstTargetType` classifies integer-branded
 *      types as `primitiveKind: "integer"` (via `_isIntegerBrandedType`),
 *      and both `integer` and `bigint` accept `"number"`. If the types
 *      disagree: `@const value type "<valueType>" is incompatible with
 *      field type "<primitiveKind>"`.
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
