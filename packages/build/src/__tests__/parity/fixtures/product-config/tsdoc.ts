/**
 * Parity fixture — product-config — TSDoc class definition.
 *
 * Equivalent form definition using a TypeScript class.
 * Must produce the same provenance-free IR as the chain DSL fixture.
 *
 * The `pricing` field uses an anonymous inline object type so the TSDoc
 * canonicalizer produces an inline ObjectTypeNode (not a ReferenceTypeNode).
 * A named class or interface would be placed in the type registry and produce
 * a ReferenceTypeNode, which would diverge from the chain DSL output.
 *
 * Field mapping:
 *   sku:              string (required)  → field.text("sku", { required: true })
 *   name:             string (required)  → field.text("name", { required: true })
 *   available:        boolean (optional) → field.boolean("available")
 *   pricing.basePrice: number (required) → field.number("basePrice", { required: true })
 *   pricing.currency: string (required)  → field.text("currency", { required: true })
 */

export class ProductConfigForm {
  sku!: string;
  name!: string;
  available?: boolean;
  pricing!: {
    basePrice: number;
    currency: string;
  };
}
