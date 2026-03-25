export class ExampleAForm {
  /** @displayName Full Name
   *  @description Your legal name
   *  @minLength 2
   *  @maxLength 100
   */
  name!: string;

  /** @displayName Age
   *  @minimum 0
   *  @maximum 150
   */
  age!: number;

  /** @displayName Score
   *  @exclusiveMinimum 0
   */
  score!: number;

  /** @displayName Email
   *  @pattern ^[^@]+@[^@]+$
   */
  email?: string;

  /** @displayName Country
   *  @enumOptions [{"id":"us","label":"United States"},{"id":"ca","label":"Canada"}]
   */
  country!: "us" | "ca";

  state?: string;

  /** @deprecated Use email instead */
  fax?: string;

  role: "admin" | "user" = "user";
}
