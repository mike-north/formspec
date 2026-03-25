interface MonetaryAmount {
  value: number;
  currency: string;
}

export class Invoice {
  /** @Minimum :value 0 @Maximum :value 9999999.99 */
  total!: MonetaryAmount;

  /** @MinLength :currency 3 @MaxLength :currency 3 @Pattern :currency ^[A-Z]{3}$ */
  discount!: MonetaryAmount;

  /** @Minimum :value 0 */
  lineItems!: MonetaryAmount[];
}
