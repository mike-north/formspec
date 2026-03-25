/**
 * Tests interactions between multiple DSL features on the same form.
 */

interface Address {
  street: string;
  city: string;
  /** @pattern ^[A-Z]{2}$ */
  state: string;
  /** @pattern ^\d{5}$ */
  zip: string;
}

export class FeatureComposition {
  /**
   * Multiple annotations + constraints on same field.
   * @Field_displayName Full Name
   * @Field_description The user's legal name
   * @minLength 1
   * @maxLength 200
   * @deprecated Use firstName + lastName instead
   */
  name!: string;

  /**
   * Constraints on nullable field.
   * Per spec: constraints apply to the non-null branch of anyOf.
   * @minimum 0
   * @maximum 150
   */
  age?: number | null;

  /**
   * Constraints on array items via path-target + array-level constraints.
   * @minItems 1
   * @maxItems 5
   * @minLength :street 1
   */
  addresses!: Address[];

  /**
   * All numeric constraint types combined.
   * @minimum 0
   * @maximum 100
   * @exclusiveMinimum 0
   * @exclusiveMaximum 100
   * @multipleOf 0.5
   */
  preciseScore!: number;
}
