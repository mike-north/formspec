/**
 * Demonstration script for the decorator-based FormSpec DSL.
 *
 * Run with: node dist/demo.js
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
} from "./index.js";

// =============================================================================
// EXAMPLE 1: Simple User Form
// =============================================================================

console.log("=".repeat(70));
console.log("EXAMPLE 1: Simple User Form");
console.log("=".repeat(70));

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
}

const userFormSpec = toFormSpec(UserForm);
console.log(JSON.stringify(userFormSpec, null, 2));

// =============================================================================
// EXAMPLE 2: Enum Options
// =============================================================================

console.log("\n");
console.log("=".repeat(70));
console.log("EXAMPLE 2: Form with Enum Options");
console.log("=".repeat(70));

@FormClass()
class PreferencesForm {
  @Label("Size")
  @EnumOptions(["small", "medium", "large"] as const)
  size!: string;

  @Label("Theme")
  @EnumOptions([
    { id: "light", label: "Light Mode" },
    { id: "dark", label: "Dark Mode" },
    { id: "auto", label: "Auto (System)" },
  ] as const)
  theme!: string;
}

const preferencesFormSpec = toFormSpec(PreferencesForm);
console.log(JSON.stringify(preferencesFormSpec, null, 2));

// =============================================================================
// EXAMPLE 3: Conditional Fields
// =============================================================================

console.log("\n");
console.log("=".repeat(70));
console.log("EXAMPLE 3: Form with Conditional Fields");
console.log("=".repeat(70));

@FormClass()
class PaymentForm {
  @Label("Payment Method")
  @EnumOptions(["credit_card", "paypal", "bank_transfer"] as const)
  paymentMethod!: string;

  @Label("Card Number")
  @Placeholder("1234 5678 9012 3456")
  @ShowWhen({ _predicate: "equals", field: "paymentMethod", value: "credit_card" })
  cardNumber?: string;

  @Label("PayPal Email")
  @Placeholder("paypal@example.com")
  @ShowWhen({ _predicate: "equals", field: "paymentMethod", value: "paypal" })
  paypalEmail?: string;
}

const paymentFormSpec = toFormSpec(PaymentForm);
console.log(JSON.stringify(paymentFormSpec, null, 2));

// =============================================================================
// EXAMPLE 4: Grouped Fields
// =============================================================================

console.log("\n");
console.log("=".repeat(70));
console.log("EXAMPLE 4: Form with Grouped Fields");
console.log("=".repeat(70));

@FormClass()
class ProfileForm {
  @Group("Personal Information")
  @Label("First Name")
  firstName!: string;

  @Group("Personal Information")
  @Label("Last Name")
  lastName!: string;

  @Group("Contact Information")
  @Label("Email")
  email!: string;

  @Group("Contact Information")
  @Label("Phone")
  @Optional()
  phone?: string;
}

const profileFormSpec = toFormSpec(ProfileForm);
console.log(JSON.stringify(profileFormSpec, null, 2));

console.log("\n");
console.log("=".repeat(70));
console.log("Demo complete!");
console.log("=".repeat(70));
