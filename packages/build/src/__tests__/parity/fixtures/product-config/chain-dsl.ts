/**
 * Parity fixture — product-config — chain DSL definition.
 *
 * A product configuration form with a nested object field for pricing.
 * Uses field.objectWithConfig() to create an inline ObjectTypeNode — matching
 * the anonymous inline object type used in the TSDoc fixture.
 *
 * Named classes/interfaces in the TSDoc fixture would produce a ReferenceTypeNode
 * via the type registry, which would diverge from the chain DSL inline object.
 * Both surfaces therefore use anonymous inline objects for the nested type.
 */

import { formspec, field } from "@formspec/dsl";

export const productConfigForm = formspec(
  field.text("sku", { required: true }),
  field.text("name", { required: true }),
  field.boolean("available"),
  field.objectWithConfig(
    "pricing",
    { required: true },
    field.number("basePrice", { required: true }),
    field.text("currency", { required: true })
  )
);
