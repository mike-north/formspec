import { formspec, field, when, is } from "@formspec/dsl";

export const ConditionalForm = formspec(
  field.enum("paymentMethod", ["card", "bank_transfer", "crypto"] as const, {
    label: "Payment Method",
    required: true,
  }),
  when(
    is("paymentMethod", "card"),
    field.text("cardNumber", { label: "Card Number", required: true }),
    field.text("expiryDate", { label: "Expiry" })
  ),
  when(
    is("paymentMethod", "bank_transfer"),
    field.text("accountNumber", { label: "Account Number", required: true }),
    field.text("routingNumber", { label: "Routing Number" })
  ),
  field.boolean("savePaymentMethod", { label: "Save for later" })
);
