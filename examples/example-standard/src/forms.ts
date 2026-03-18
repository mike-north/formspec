import {
  Field,
  Group,
  ShowWhen,
  EnumOptions,
  Minimum,
  Maximum,
  MinLength,
  MaxLength,
  Pattern,
} from "@formspec/decorators";

export class UserRegistrationForm {
  @Group("Personal Information")
  @Field({ displayName: "Full Name", description: "Your legal name", placeholder: "Jane Doe" })
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @Group("Personal Information")
  @Field({ displayName: "Email Address", description: "We'll send a confirmation email" })
  @Pattern("^[\\w.-]+@[\\w.-]+\\.[a-zA-Z]{2,}$")
  email: string;

  @Group("Personal Information")
  @Field({ displayName: "Age" })
  @Minimum(13)
  @Maximum(120)
  age: number;

  @Group("Account")
  @Field({ displayName: "Username", placeholder: "johndoe42" })
  @MinLength(3)
  @MaxLength(30)
  @Pattern("^[a-zA-Z0-9_]+$")
  username: string;

  @Group("Account")
  @Field({ displayName: "Account Type" })
  @EnumOptions([
    { id: "personal", label: "Personal" },
    { id: "business", label: "Business" },
    { id: "enterprise", label: "Enterprise" },
  ])
  accountType: "personal" | "business" | "enterprise";

  @Group("Preferences")
  @Field({ displayName: "Preferred Language" })
  @EnumOptions(["en", "es", "fr", "de", "ja"])
  language: "en" | "es" | "fr" | "de" | "ja";

  @Group("Preferences")
  @Field({ displayName: "Newsletter" })
  newsletter?: boolean;

  @ShowWhen({ field: "accountType", value: "business" })
  @Group("Business Details")
  @Field({ displayName: "Company Name" })
  companyName?: string;

  @ShowWhen({ field: "accountType", value: "business" })
  @Group("Business Details")
  @Field({ displayName: "Tax ID" })
  @Pattern("^\\d{2}-\\d{7}$")
  taxId?: string;

  /** @deprecated Use accountType instead */
  @Field({ displayName: "Plan" })
  plan?: string;

  @Field({ displayName: "Referral Code" })
  referralCode = "NONE";
}
