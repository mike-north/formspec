/**
 * @formspec/exp-path-safety
 *
 * Experiment package for testing TypeScript path type safety patterns
 * for the formspec DSL.
 *
 * KEY FINDINGS:
 *
 * 1. PathsOf<T> - Generates all valid dot-notation paths through an object type
 *    - Works well for objects, stops at primitives and arrays
 *    - Invalid paths rejected at compile time
 *    - Nested paths use dot notation: "max_discount.amount"
 *
 * 2. TypeAtPath<T, P> - Resolves the type at a given path
 *    - Handles nested paths with dot notation
 *    - Returns `never` for invalid paths
 *
 * 3. PathsToType<T, V> - Filters paths by value type
 *    - Uses TypeScript's standard assignability: T[Path] extends V
 *    - String literal unions ("a" | "b") ARE assignable to string
 *    - `number | null` is NOT assignable to `number` (strict)
 *    - `number` IS assignable to `number | null` (widening)
 *
 * ASSIGNABILITY EXAMPLES:
 *
 *   PathsToType<Schema, string>     includes "duration" ("forever"|"once"|"repeating")
 *   PathsToType<Schema, number>     excludes "duration_in_months" (number | null)
 *   PathsToType<Schema, number|null> includes "duration_in_months" AND "percent_off"
 *
 * USAGE PATTERNS:
 *
 *   // Generic field that accepts any valid path
 *   type FieldProps<S, P extends PathsOf<S>> = { path: P };
 *
 *   // Number field that only accepts paths to numbers
 *   type NumberFieldProps<S, P extends PathsToType<S, number>> = { path: P };
 *
 *   // Get the value type for a specific path
 *   type ValueType = TypeAtPath<Schema, "max_discount.amount">; // number
 *
 * LIMITATIONS:
 *
 *   - Array paths not supported (no "items[0]" or "items.0" syntax)
 *   - Deep nesting may hit TypeScript's recursion limits
 *   - PathsToType uses exact assignability, may need variants for looser matching
 */

export type { PathsOf, TypeAtPath, PathsToType, CouponSchema } from "./path-types.js";
