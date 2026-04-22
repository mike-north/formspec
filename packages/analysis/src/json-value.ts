/**
 * JSON value helpers shared across the analysis package.
 *
 * Both {@link ./semantic-targets.ts}'s IR validator and
 * {@link ./constraint-applicability.ts}'s snapshot-path `@const` check need
 * deep-equality and type-guard helpers for `JsonValue`. This file holds the
 * canonical implementations so the two callers cannot drift.
 *
 * These helpers are internal to `@formspec/analysis` — they are not re-
 * exported from `internal.ts` and are not part of the published API.
 *
 * @internal
 */

import type { JsonValue } from "@formspec/core/internals";

/**
 * Type guard: value is a JSON array.
 *
 * @internal
 */
function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

/**
 * Type guard: value is a JSON object (non-null, non-array).
 *
 * @internal
 */
function isJsonObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-equality check for two JSON values.
 *
 * Compares arrays element-wise (order-sensitive) and objects key-wise
 * (order-insensitive; sorted key comparison). Primitives compare via `===`.
 *
 * Canonical implementation. Both the IR validator in `semantic-targets.ts`
 * and the snapshot-path `@const` check in `constraint-applicability.ts` call
 * this — keep them consistent by editing this file, not by adding per-caller
 * copies.
 *
 * @internal
 */
export function jsonValueEquals(left: JsonValue, right: JsonValue): boolean {
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
