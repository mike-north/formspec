/**
 * Simple order class for CLI e2e testing.
 */
export class SimpleOrder {
  orderId!: string;
  customerName!: string;
  amount!: number;
  currency!: "usd" | "eur";
  status!: "pending" | "paid" | "shipped" | "delivered";
  shippingAddress?: string;
  notes?: string;
}
