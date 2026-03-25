import { formspec, field, group } from "@formspec/dsl";

export const NestedForm = formspec(
  group(
    "Billing",
    field.text("customerName", { label: "Name", required: true }),
    field.objectWithConfig(
      "billingAddress",
      { label: "Billing Address", required: true },
      field.text("street", { label: "Street", required: true }),
      field.text("city", { label: "City", required: true }),
      field.text("zip", { label: "ZIP" })
    )
  ),
  field.objectWithConfig(
    "shippingAddress",
    { label: "Shipping Address" },
    field.text("street", { label: "Street", required: true }),
    field.text("city", { label: "City", required: true }),
    field.text("zip", { label: "ZIP" })
  ),
  field.arrayWithConfig(
    "lineItems",
    { label: "Line Items", minItems: 1, maxItems: 100, required: true },
    field.text("description", { label: "Description", required: true }),
    field.number("quantity", { label: "Qty", min: 1, max: 9999 }),
    field.number("unitPrice", { label: "Price", min: 0 })
  )
);
