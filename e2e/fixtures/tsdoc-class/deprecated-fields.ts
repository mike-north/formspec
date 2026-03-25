/**
 * Tests @deprecated tag extraction, both bare and with a message.
 */
export class DeprecatedFields {
  name!: string;

  /** @deprecated */
  oldField?: string;

  /** @deprecated Use fullName instead */
  legacyName?: string;
}
