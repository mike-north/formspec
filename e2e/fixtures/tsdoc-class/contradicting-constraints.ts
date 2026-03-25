/** Tests that contradictory constraints are detected. */
export class ContradictingConstraints {
  /** @minimum 100 @maximum 50 */
  invertedRange!: number;

  /** @exclusiveMinimum 50 @exclusiveMaximum 50 */
  emptyExclusiveRange!: number;

  /** @minLength 100 @maxLength 10 */
  invertedLength!: string;

  /** @minItems 10 @maxItems 1 */
  invertedItems!: string[];
}
