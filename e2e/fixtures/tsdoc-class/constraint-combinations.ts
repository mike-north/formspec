/**
 * Tests multiple constraints combined on a single field.
 */
export class ConstraintCombinations {
  /**
   * @minimum 0
   * @maximum 1000
   * @multipleOf 5
   */
  roundedScore!: number;

  /**
   * @minLength 3
   * @maxLength 50
   * @pattern ^[a-zA-Z][a-zA-Z0-9_]*$
   */
  username!: string;

  /**
   * @minItems 1
   * @maxItems 5
   */
  choices!: string[];
}
