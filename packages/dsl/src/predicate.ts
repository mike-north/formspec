/**
 * Predicate builder functions for conditional logic.
 *
 * These functions create predicates for use with `when()`:
 * - `is()` - Check if a field equals a specific value
 *
 * @example
 * ```typescript
 * when(is("status", "draft"),
 *   field.text("notes"),
 * )
 * ```
 */

import type { EqualsPredicate } from "@formspec/core";

/**
 * Creates an equality predicate that checks if a field equals a specific value.
 *
 * Use this with `when()` to create readable conditional expressions:
 *
 * @example
 * ```typescript
 * // Show cardNumber field when paymentMethod is "card"
 * when(is("paymentMethod", "card"),
 *   field.text("cardNumber", { label: "Card Number" }),
 * )
 * ```
 *
 * @typeParam K - The field name (inferred as string literal)
 * @typeParam V - The value type (inferred as literal)
 * @param field - The name of the field to check
 * @param value - The value the field must equal
 * @returns An EqualsPredicate for use with `when()`
 */
export function is<const K extends string, const V>(
  field: K,
  value: V,
): EqualsPredicate<K, V> {
  return {
    _predicate: "equals",
    field,
    value,
  };
}
