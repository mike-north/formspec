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

  unconstrained!: number[];
}
