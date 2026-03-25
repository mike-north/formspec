export class NumericConstraintsForm {
  /** @minimum 0 */
  nonNegative!: number;

  /** @minimum -100 */
  allowsNegative!: number;

  /** @minimum 0 @maximum 0 */
  exactlyZero!: number;

  /** @minimum 0.5 @maximum 99.5 */
  floatBounds!: number;

  /** @exclusiveMinimum 0 */
  strictlyPositive!: number;

  /** @exclusiveMaximum 100 */
  strictlyBelow100!: number;

  /** @exclusiveMinimum 0 @exclusiveMaximum 1 */
  openInterval!: number;

  /** @minimum 0 @exclusiveMaximum 100 */
  mixedBounds!: number;

  /** @exclusiveMinimum -1 @maximum 1 */
  mixedBoundsReverse!: number;

  /** @multipleOf 0.01 */
  currency!: number;

  /** @multipleOf 5 */
  steppedBy5!: number;

  /** @minimum 0 @maximum 100 @multipleOf 5 */
  percentStepped!: number;

  unconstrained!: number;
}
