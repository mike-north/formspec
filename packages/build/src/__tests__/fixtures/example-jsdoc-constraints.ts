import { Field, Minimum } from "@formspec/decorators";

export class JSDocConstraintsForm {
  /** @MinLength 1 @MaxLength 200 */
  @Field({ displayName: "Name" })
  name!: string;

  /** @Minimum 0 @Maximum 150 */
  @Field({ displayName: "Age" })
  age!: number;

  /** @Minimum 0.01 @Maximum 1000 */
  @Field({ displayName: "Weight" })
  weight!: number;

  /** @Minimum -273.15 */
  @Field({ displayName: "Temperature" })
  temperature!: number;

  /** @Pattern ^[A-Z]{3}-\d{4}$ */
  @Field({ displayName: "SKU" })
  sku!: string;

  // Cross-source: decorator for one, JSDoc for another
  /** @ExclusiveMaximum 10000 */
  @Field({ displayName: "Stock" })
  @Minimum(0)
  stock!: number;

  // No constraints
  @Field({ displayName: "Notes" })
  notes?: string;
}
