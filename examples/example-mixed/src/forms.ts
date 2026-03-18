import { Field, Group, Minimum, Maximum, EnumOptions, ShowWhen } from "@formspec/decorators";

/**
 * A product form demonstrating mixed decorator and TSDoc constraint styles.
 *
 * - Some constraints are expressed via decorators only
 * - Some via TSDoc tags only
 * - Some use a decorator for one constraint and TSDoc for another (cross-source)
 */
export class ProductForm {
  /** @MinLength 1 @MaxLength 200 */
  @Group("Details")
  @Field({ displayName: "Product Name" })
  name!: string;

  @Group("Details")
  @Field({ displayName: "Price" })
  @Minimum(0)
  @Maximum(99999)
  price!: number;

  /** @Minimum 0.01 @Maximum 1000 */
  @Group("Details")
  @Field({ displayName: "Weight (kg)" })
  weight!: number;

  /** @Pattern ^[A-Z]{3}-\d{4}$ */
  @Group("Details")
  @Field({ displayName: "SKU" })
  sku!: string;

  /** @ExclusiveMaximum 10000 */
  @Group("Inventory")
  @Field({ displayName: "Stock Count" })
  @Minimum(0)
  stock!: number;

  /** @MinLength 5 @MaxLength 20 */
  @Group("Inventory")
  @Field({ displayName: "Batch Code" })
  batchCode?: string;

  @Group("Shipping")
  @Field({ displayName: "Category" })
  @EnumOptions(["electronics", "clothing", "food", "other"])
  category!: "electronics" | "clothing" | "food" | "other";

  /** @Minimum 1 @Maximum 365 */
  @ShowWhen({ field: "category", value: "food" })
  @Group("Shipping")
  @Field({ displayName: "Expiry Days" })
  expiryDays?: number;
}
