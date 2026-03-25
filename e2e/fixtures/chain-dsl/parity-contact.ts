import { formspec, field } from "@formspec/dsl";

export const ParityContact = formspec(
  field.number("age", { required: true, min: 1, max: 100 }),
  field.text("name", { required: true, minLength: 1, maxLength: 200 }),
  field.text("email", { required: true, pattern: "^[^@]+@[^@]+$" }),
  field.enum("country", ["us", "ca", "uk"] as const, { required: true }),
  field.text("bio")
);
