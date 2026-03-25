/**
 * Product form for e2e testing.
 */
export class ProductForm {
  name!: string;
  description?: string;
  price!: number;
  currency!: "usd" | "eur" | "gbp";
  active!: boolean;
  tags?: string[];
  metadata?: Record<string, string>;
}
