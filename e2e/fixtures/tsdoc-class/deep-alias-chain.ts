/**
 * Tests 3+ level type alias constraint inheritance.
 * @see 005-numeric-types.md
 */

/** @minimum 0 @maximum 100 */
type Percentage = number;

/** @multipleOf 5 */
type RoundedPercentage = Percentage;

/** @minimum 10 */
type HighPercentage = RoundedPercentage;

export class DeepAliasChain {
  /** Field using a 3-level alias chain */
  confidence!: HighPercentage;

  /** Field using a 2-level alias chain */
  score!: RoundedPercentage;

  /** Field using base alias */
  ratio!: Percentage;
}
