/**
 * Parity fixture — user-registration — chain DSL definition.
 *
 * A user registration form with a mix of text, boolean, and enum fields.
 * No constraints or annotations so the provenance-free IR can be compared
 * directly with the TSDoc equivalent.
 *
 * Uses plain string enum options to match the string literal union type
 * produced by the TSDoc surface.
 */

import { formspec, field } from "@formspec/dsl";

export const userRegistrationForm = formspec(
  field.text("email", { required: true }),
  field.text("username", { required: true }),
  field.boolean("agreedToTerms", { required: true }),
  field.enum("accountType", ["personal", "business", "enterprise"] as const, { required: true })
);
