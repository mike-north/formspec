/** @maximum 100 */
type Percent = number;

interface Discount {
  percent: Percent;
}

export class PathTargetInheritedContradictionForm {
  /** @minimum :percent 120 */
  discount!: Discount;
}
