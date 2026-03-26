export class ExclusiveBoundsForm {
  /** @exclusiveMinimum 0 @exclusiveMaximum 1 */
  probability!: number;

  /** @exclusiveMinimum -273.15 */
  temperature!: number;

  /** @exclusiveMinimum 0 @maximum 100 */
  mixedLower!: number;

  /** @minimum 0 @exclusiveMaximum 1 */
  mixedUpper!: number;
}
