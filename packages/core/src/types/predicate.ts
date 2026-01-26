/**
 * Predicate types for conditional logic.
 *
 * Predicates are used with `when()` to define conditions in a readable way.
 */

/**
 * An equality predicate that checks if a field equals a specific value.
 *
 * @typeParam K - The field name to check
 * @typeParam V - The value to compare against
 */
export interface EqualsPredicate<K extends string, V> {
  /** Predicate type discriminator */
  readonly _predicate: "equals";
  /** Name of the field to check */
  readonly field: K;
  /** Value that the field must equal */
  readonly value: V;
}

/**
 * Union of all predicate types.
 *
 * Currently only supports equality, but can be extended with:
 * - `OneOfPredicate` - field value is one of several options
 * - `NotPredicate` - negation of another predicate
 * - `AndPredicate` / `OrPredicate` - logical combinations
 */
export type Predicate<K extends string = string, V = unknown> = EqualsPredicate<K, V>;
