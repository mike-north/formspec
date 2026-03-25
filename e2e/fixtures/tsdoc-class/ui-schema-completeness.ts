export interface BillingAddress {
  street: string;
  city: string;
}

export class UiSchemaCompletenessForm {
  accountId!: string;

  /**
   * @displayName Full Name
   * @placeholder Enter your full name
   */
  fullName!: string;

  emailAddress!: string;

  billingAddress!: BillingAddress;
}
