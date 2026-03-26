import { formspec, field, when, is } from "@formspec/dsl";

export const CrossAxisConditionalForm = formspec(
  field.enum("country", ["US", "CA"] as const, {
    label: "Country",
    required: true,
  }),
  field.enum("paymentMethod", ["card", "bank"] as const, {
    label: "Payment Method",
    required: true,
  }),
  field.enum("accountType", ["checking", "savings"] as const, {
    label: "Account Type",
    required: true,
  }),
  when(
    is("country", "US"),
    when(
      is("paymentMethod", "bank"),
      when(is("accountType", "checking"), field.text("routingNumber", { label: "Routing Number" }))
    )
  )
);
