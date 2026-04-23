/**
 * Parity fixture — plan-status — TSDoc class definition.
 *
 * This stays on the shared static surface. The TSDoc field carries the same
 * field-level label and member labels that the chain DSL expresses via
 * `field.enum(..., [{ id, label }], { label })`.
 */

export class SubscriptionForm {
  /**
   * @displayName Plan Status
   * @displayName :active Active
   * @displayName :paused Paused
   * @displayName :cancelled Cancelled
   */
  status!: "active" | "paused" | "cancelled";
}
