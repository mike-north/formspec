/**
 * Parity fixture — address — TSDoc class definition.
 *
 * Equivalent form definition using a TypeScript class.
 * Must produce the same provenance-free IR as the chain DSL fixture.
 *
 * Field mapping:
 *   street:     string (required) → field.text("street", { required: true })
 *   city:       string (required) → field.text("city", { required: true })
 *   postalCode: string (required) → field.text("postalCode", { required: true })
 *   country:    string (optional) → field.text("country")
 */

export class AddressForm {
  street!: string;
  city!: string;
  postalCode!: string;
  country?: string;
}
