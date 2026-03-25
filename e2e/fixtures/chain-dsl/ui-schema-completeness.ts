import { formspec, field, group, when, is } from "@formspec/dsl";

export const UiSchemaCompletenessForm = formspec(
  group(
    "Profile",
    field.text("firstName", {
      label: "First Name",
      placeholder: "Enter your first name",
      required: true,
    }),
    field.text("lastName", { required: true }),
    field.text("emailAddress")
  ),
  field.enum("contactMethod", ["email", "phone"] as const, {
    label: "Preferred Contact Method",
    required: true,
  }),
  when(is("contactMethod", "phone"), field.text("phoneNumber", { label: "Phone Number" })),
  field.objectWithConfig(
    "billingAddress",
    { label: "Billing Address" },
    field.text("street", { label: "Street", required: true }),
    field.text("city", { label: "City", required: true })
  )
);
