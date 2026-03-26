interface MonetaryAmount {
  value: number;
  currency: string;
}

export class BrokenInvoice {
  /** @minimum :currency 0 */
  total!: MonetaryAmount;
}
