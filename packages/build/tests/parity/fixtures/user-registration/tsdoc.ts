/**
 * Parity fixture — user-registration — TSDoc class definition.
 *
 * Equivalent form definition using a TypeScript class.
 * Must produce the same provenance-free IR as the chain DSL fixture.
 *
 * Field mapping:
 *   email:          string (required)                            → field.text("email", { required: true })
 *   username:       string (required)                            → field.text("username", { required: true })
 *   agreedToTerms:  boolean (required)                           → field.boolean("agreedToTerms", { required: true })
 *   accountType:    "personal" | "business" | "enterprise" (req) → field.enum("accountType", [...] as const, { required: true })
 */

export class UserRegistrationForm {
  email!: string;
  username!: string;
  agreedToTerms!: boolean;
  accountType!: "personal" | "business" | "enterprise";
}
