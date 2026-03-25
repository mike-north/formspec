/**
 * @displayName User Profile Form
 */
export class UserProfileForm {
  /** @displayName Full Legal Name */
  fullName!: string;

  /** @displayName Email Address */
  email!: string;

  // No @displayName — tests inference/absence
  age?: number;

  /**
   * @displayName :active Active Account
   * @displayName :suspended Suspended
   * @displayName :closed Permanently Closed
   */
  status!: "active" | "suspended" | "closed";

  /**
   * @displayName Preferred Language
   */
  language!: "en" | "fr" | "de";
}
