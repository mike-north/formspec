export class ExampleAForm {
  /** @Field_displayName Full Name
   *  @Field_description Your legal name
   *  @minLength 2
   *  @maxLength 100
   */
  name!: string;

  /** @Field_displayName Age
   *  @minimum 0
   *  @maximum 150
   */
  age!: number;

  /** @Field_displayName Score
   *  @exclusiveMinimum 0
   */
  score!: number;

  /** @Field_displayName Email
   *  @pattern ^[^@]+@[^@]+$
   */
  email?: string;

  /** @Field_displayName Country
   *  @enumOptions [{"id":"us","label":"United States"},{"id":"ca","label":"Canada"}]
   */
  country!: "us" | "ca";

  state?: string;

  /** @deprecated Use email instead */
  fax?: string;

  role: "admin" | "user" = "user";
}
