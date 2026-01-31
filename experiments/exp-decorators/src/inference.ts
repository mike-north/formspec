/**
 * Type utility for inferring schema from decorated classes.
 *
 * This type extracts the data schema from a class definition,
 * handling nested objects, arrays, and primitive types.
 */

/**
 * Extracts the schema type from a decorated class.
 *
 * This utility type:
 * - Removes function properties (methods)
 * - Recursively processes nested class instances
 * - Preserves arrays with nested inference
 * - Keeps primitive types as-is
 *
 * @typeParam T - The class type to extract schema from
 *
 * @example
 * ```typescript
 * class Address {
 *   street!: string;
 *   city!: string;
 * }
 *
 * class Person {
 *   name!: string;
 *   age?: number;
 *   address!: Address;
 *   tags!: string[];
 * }
 *
 * type PersonSchema = InferClassSchema<Person>;
 * // Result: {
 * //   name: string;
 * //   age?: number;
 * //   address: { street: string; city: string };
 * //   tags: string[];
 * // }
 * ```
 */
export type InferClassSchema<T> = {
  // Only include non-function properties
  [K in keyof T as T[K] extends (...args: unknown[]) => unknown ? never : K]: T[K] extends (infer U)[]
    ? // Array type: recursively infer the item type
      InferArrayItemSchema<U>[]
    : T[K] extends object
      ? // Object type: recursively infer nested schema
        InferClassSchema<T[K]>
      : // Primitive type: keep as-is
        T[K];
};

/**
 * Helper type for inferring array item schemas.
 *
 * This handles the case where array items might be objects that need
 * recursive schema extraction.
 *
 * @typeParam U - The array item type
 */
type InferArrayItemSchema<U> = U extends object ? InferClassSchema<U> : U;
