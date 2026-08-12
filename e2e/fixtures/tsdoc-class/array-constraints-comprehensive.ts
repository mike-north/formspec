export class ArrayConstraintsForm {
  /** @minItems 1 */
  nonEmpty!: string[];

  /** @maxItems 100 */
  bounded!: string[];

  /** @minItems 0 */
  allowsEmpty!: string[];

  /** @minItems 1 @maxItems 10 */
  combinedBounds!: string[];

  /** @uniqueItems */
  uniqueTags!: string[];

  /** @minItems 1 @maxItems 5 @uniqueItems */
  allConstraints!: string[];

  /** @maxLength 50 */
  itemConstrained!: string[];

  /** @minimum 0 */
  nonNegativeItems!: number[];

  /** @const "USD" */
  constantItems!: string[];

  /** @const "draft" */
  statusHistory!: ("draft" | "sent")[];

  unconstrained!: number[];
}
