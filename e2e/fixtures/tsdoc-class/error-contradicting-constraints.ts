export class ContradictingConstraintsForm {
  /**
   * @minimum 10
   * @maximum 5
   */
  count!: number;

  /**
   * @minLength 5
   * @maxLength 2
   */
  code!: string;
}
