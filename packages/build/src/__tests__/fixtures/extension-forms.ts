type MoneyDecimal = string;

export interface BillingForm {
  /** @minimum USD */
  amount: MoneyDecimal;
}
