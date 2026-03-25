export class StringConstraintsForm {
  /** @minLength 1 */
  nonEmpty!: string;

  /** @maxLength 255 */
  bounded!: string;

  /** @minLength 0 */
  allowsEmpty!: string;

  /** @minLength 2 @maxLength 2 */
  exactLength!: string;

  /** @minLength 1 @maxLength 1000 */
  combinedBounds!: string;

  /** @pattern ^[a-z]+$ */
  lowercaseOnly!: string;

  /** @pattern ^[^@]+@[^@]+\.[^@]+$ */
  emailPattern!: string;

  /** @pattern ^\d{3}-\d{2}-\d{4}$ */
  ssnPattern!: string;

  /** @minLength 5 @maxLength 100 @pattern ^[^@]+@[^@]+$ */
  constrainedEmail!: string;

  /** @format email */
  emailFormat!: string;

  /** @format date */
  dateFormat!: string;

  /** @format uri */
  uriFormat!: string;

  unconstrained!: string;
}
