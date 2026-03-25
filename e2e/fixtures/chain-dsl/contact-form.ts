import { formspec, field, group, when, is } from "@formspec/dsl";

export const ContactForm = formspec(
  group(
    "Personal Info",
    field.text("firstName", { label: "First Name", required: true }),
    field.text("lastName", { label: "Last Name", required: true }),
    field.text("email", { label: "Email" })
  ),
  group(
    "Preferences",
    field.enum("contactMethod", ["email", "phone", "mail"] as const, {
      label: "Preferred Contact Method",
      required: true,
    }),
    when(is("contactMethod", "phone"), field.text("phoneNumber", { label: "Phone Number" })),
    field.number("age", { label: "Age", min: 0, max: 150 }),
    field.boolean("newsletter", { label: "Subscribe to Newsletter" })
  )
);
