export class ConstrainedForm {
  /** @displayName Full Name */
  name!: string;

  /** @minimum 0 @maximum 150 */
  age!: number;

  /** @minLength 5 @maxLength 100 @pattern ^[^@]+@[^@]+$ */
  email!: string;

  /** @minItems 1 @maxItems 10 */
  tags!: string[];

  /** @deprecated */
  legacyField?: string;
}
