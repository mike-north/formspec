/**
 * Tests error handling for invalid path-target constraints.
 */

/** A simple type to test against */
interface Amount {
  value: number;
  currency: string;
}

export class PathTargetErrors {
  /** @minimum :nonexistent 0 */
  total!: Amount;

  /** @minimum :value 0 */
  primitiveField!: number;
}
