/**
 * Parity fixture — address — chain DSL definition.
 *
 * A simple address form with string fields for street, city, and postal code.
 * No constraints or annotations so the provenance-free IR can be compared
 * directly with the TSDoc equivalent.
 */

import { formspec, field } from "@formspec/dsl";

export const addressForm = formspec(
  field.text("street", { required: true }),
  field.text("city", { required: true }),
  field.text("postalCode", { required: true }),
  field.text("country")
);
