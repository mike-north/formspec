import { Group, ShowWhen, EnumOptions, MinLength, MaxLength } from "@formspec/decorators";
import { StrictField, BoundedMin, BoundedMax } from "./decorators.js";

export class OrderForm {
  @Group("Customer")
  @StrictField({ displayName: "Customer Name", description: "Full legal name" })
  @MinLength(1)
  @MaxLength(200)
  customerName!: string;

  @Group("Customer")
  @StrictField({ displayName: "Customer Email" })
  customerEmail!: string;

  @Group("Order Details")
  @StrictField({ displayName: "Quantity" })
  @BoundedMin(1)
  @BoundedMax(999)
  quantity!: number;

  @Group("Order Details")
  @StrictField({ displayName: "Unit Price" })
  @BoundedMin(0)
  @BoundedMax(99999)
  unitPrice!: number;

  @Group("Order Details")
  @StrictField({ displayName: "Priority" })
  @EnumOptions([
    { id: "low", label: "Low" },
    { id: "normal", label: "Normal" },
    { id: "high", label: "High" },
    { id: "urgent", label: "Urgent" },
  ])
  priority!: "low" | "normal" | "high" | "urgent";

  @Group("Shipping")
  @StrictField({ displayName: "Shipping Method" })
  @EnumOptions(["standard", "express", "overnight"])
  shippingMethod!: "standard" | "express" | "overnight";

  @ShowWhen({ field: "shippingMethod", value: "express" })
  @Group("Shipping")
  @StrictField({ displayName: "Express Instructions" })
  expressInstructions?: string;

  @Group("Shipping")
  @StrictField({ displayName: "Discount Code" })
  discountCode?: string;
}
