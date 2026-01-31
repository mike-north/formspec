/**
 * Example usage of the decorator-based FormSpec DSL.
 *
 * This file demonstrates how to define forms using decorators
 * and convert them to FormSpec.
 */

import {
  FormClass,
  Label,
  Optional,
  Placeholder,
  Min,
  Max,
  EnumOptions,
  Group,
  ShowWhen,
  toFormSpec,
  type InferClassSchema,
} from "./index.js";

// =============================================================================
// EXAMPLE 1: Simple User Form
// =============================================================================

@FormClass()
class UserForm {
  @Label("Full Name")
  @Placeholder("John Doe")
  name!: string;

  @Label("Email Address")
  @Placeholder("user@example.com")
  email!: string;

  @Label("Age")
  @Min(0)
  @Max(120)
  @Optional()
  age?: number;

  @Label("Subscribe to newsletter")
  @Optional()
  newsletter?: boolean;
}

// Convert to FormSpec
const userFormSpec = toFormSpec(UserForm);

// Infer schema type
type UserSchema = InferClassSchema<UserForm>;
// Result: { name: string; email: string; age?: number; newsletter?: boolean }

// =============================================================================
// EXAMPLE 2: Form with Enums and Conditionals
// =============================================================================

@FormClass()
class PaymentForm {
  @Label("Payment Method")
  @EnumOptions(["credit_card", "paypal", "bank_transfer"] as const)
  paymentMethod!: "credit_card" | "paypal" | "bank_transfer";

  // Only show when credit card is selected
  @Label("Card Number")
  @Placeholder("1234 5678 9012 3456")
  @ShowWhen({ _predicate: "equals", field: "paymentMethod", value: "credit_card" })
  cardNumber?: string;

  // Only show when PayPal is selected
  @Label("PayPal Email")
  @Placeholder("paypal@example.com")
  @ShowWhen({ _predicate: "equals", field: "paymentMethod", value: "paypal" })
  paypalEmail?: string;
}

const paymentFormSpec = toFormSpec(PaymentForm);

// =============================================================================
// EXAMPLE 3: Form with Groups
// =============================================================================

@FormClass()
class ProfileForm {
  // Personal Info group
  @Group("Personal Information")
  @Label("First Name")
  firstName!: string;

  @Group("Personal Information")
  @Label("Last Name")
  lastName!: string;

  @Group("Personal Information")
  @Label("Date of Birth")
  @Optional()
  dateOfBirth?: string;

  // Contact Info group
  @Group("Contact Information")
  @Label("Email")
  email!: string;

  @Group("Contact Information")
  @Label("Phone")
  @Optional()
  phone?: string;
}

const profileFormSpec = toFormSpec(ProfileForm);

// =============================================================================
// EXAMPLE 4: Enum with Object Options
// =============================================================================

@FormClass()
class PreferencesForm {
  @Label("Theme")
  @EnumOptions([
    { id: "light", label: "Light Mode" },
    { id: "dark", label: "Dark Mode" },
    { id: "auto", label: "Auto (System)" },
  ] as const)
  theme!: string;

  @Label("Language")
  @EnumOptions([
    { id: "en", label: "English" },
    { id: "es", label: "Español" },
    { id: "fr", label: "Français" },
  ] as const)
  language!: string;
}

const preferencesFormSpec = toFormSpec(PreferencesForm);

// Export examples
export { userFormSpec, paymentFormSpec, profileFormSpec, preferencesFormSpec };
export type { UserSchema };
