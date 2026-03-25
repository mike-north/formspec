interface Address {
  street: string;
  city: string;
  zip: string;
  country: string;
}

export class OrderForm {
  orderId!: string;
  billingAddress!: Address;
  shippingAddress!: Address;
  notes?: string;
}
