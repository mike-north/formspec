import {
  Field,
  Minimum,
  Maximum,
  ExclusiveMinimum,
  MinLength,
  MaxLength,
  Pattern,
  Group,
  ShowWhen,
  EnumOptions,
} from "@formspec/decorators";

export class ExampleAForm {
  @Field({ displayName: "Full Name", description: "Your legal name" })
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @Field({ displayName: "Age" })
  @Minimum(0)
  @Maximum(150)
  age!: number;

  @Field({ displayName: "Score" })
  @ExclusiveMinimum(0)
  score!: number;

  @Field({ displayName: "Email" })
  @Pattern("^[^@]+@[^@]+$")
  email?: string;

  @Group("Preferences")
  @Field({ displayName: "Country" })
  @EnumOptions([
    { id: "us", label: "United States" },
    { id: "ca", label: "Canada" },
  ])
  country!: "us" | "ca";

  @ShowWhen({ field: "country", value: "us" })
  @Field({ displayName: "State" })
  state?: string;

  /** @deprecated Use email instead */
  @Field({ displayName: "Fax Number" })
  fax?: string;

  @Field({ displayName: "Role" })
  role: "admin" | "user" = "user";
}
