/**
 * Tests constraint tags that were missing from E2E coverage.
 */
export class ExtendedConstraints {
  /**
   * @exclusiveMinimum 0
   * @exclusiveMaximum 100
   */
  score!: number;

  /** @multipleOf 0.25 */
  quarterSteps!: number;

  /** @Field_description A detailed description of this field */
  notes?: string;
}
