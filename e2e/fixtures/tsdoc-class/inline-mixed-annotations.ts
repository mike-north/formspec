/**
 * Reproduces the pattern used by apps-extensibility-sdk's class-config.ts:
 * JSDoc comments with @displayName, summary text descriptions, and constraint
 * tags using multi-line JSDoc format.
 *
 * @see https://github.com/stripe/apps-extensibility-sdk (examples/schema-extraction/src/class-config.ts)
 */
export class InlineMixedAnnotationsForm {
  /**
   * Internal name for this discount program
   * @displayName Program Name
   * @minLength 1
   * @maxLength 80
   */
  programName!: string;

  /** @displayName Discount Type */
  discountType!: 'percentage' | 'fixed';

  /**
   * Percentage to discount (0-100)
   * @displayName Discount Percentage
   * @minimum 0
   * @maximum 100
   */
  discountPercentage?: number;

  /**
   * Fixed amount to discount (in minor units)
   * @displayName Fixed Discount Amount
   * @minimum 0
   */
  fixedDiscountAmount?: number;

  /**
   * Minimum subtotal to qualify
   * @displayName Minimum Order Amount
   * @minimum 0
   */
  minimumOrderAmount?: number;

  /**
   * Whether this discount program is currently active
   * @displayName Active
   */
  active!: boolean;
}
