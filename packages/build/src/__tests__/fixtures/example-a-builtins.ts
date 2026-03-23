export class ExampleAForm {
  /** @Field_displayName Full Name
   *  @Field_description Your legal name
   *  @MinLength 2
   *  @MaxLength 100
   */
  name!: string;

  /** @Field_displayName Age
   *  @Minimum 0
   *  @Maximum 150
   */
  age!: number;

  /** @Field_displayName Score
   *  @ExclusiveMinimum 0
   */
  score!: number;

  /** @Field_displayName Email
   *  @Pattern ^[^@]+@[^@]+$
   */
  email?: string;

  /** @Field_displayName Country
   *  @EnumOptions [{"id":"us","label":"United States"},{"id":"ca","label":"Canada"}]
   */
  country!: "us" | "ca";

  state?: string;

  /** @deprecated Use email instead */
  fax?: string;

  role: "admin" | "user" = "user";
}
