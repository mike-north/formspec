interface MonetaryAmount {
  value: number;
  currency: string;
}

export class Invoice {
  /** @minimum :value 0 @maximum :value 9999999.99 */
  total!: MonetaryAmount;

  /** @minLength :currency 3 @maxLength :currency 3 @pattern :currency ^[A-Z]{3}$ */
  discount!: MonetaryAmount;

  /** @minimum :value 0 */
  lineItems!: MonetaryAmount[];
}
