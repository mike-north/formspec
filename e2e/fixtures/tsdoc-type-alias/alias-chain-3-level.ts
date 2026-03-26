/** @minimum 0 */
type BaseAmount = number;

/** @maximum 1000 */
type BoundedAmount = BaseAmount;

/** @multipleOf 5 */
type SteppedAmount = BoundedAmount;

export class AliasChainThreeLevelForm {
  amount!: SteppedAmount;
}
