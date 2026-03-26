/**
 * @displayName Plan Status
 * @displayName :active Active
 * @displayName :paused Paused
 * @displayName :cancelled Cancelled
 */
type PlanStatus = "active" | "paused" | "cancelled";

export class Subscription {
  /** @defaultValue "active" */
  status!: PlanStatus;
}
