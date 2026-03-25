import { formspec, field } from "@formspec/dsl";

export const OrderForm = formspec(
  field.text("orderId", { label: "Order ID", required: true }),
  field.text("customerName", { label: "Customer Name", required: true }),
  field.number("amount", { label: "Amount", min: 0 }),
  field.enum("status", ["pending", "processing", "complete"] as const, {
    label: "Status",
  })
);
