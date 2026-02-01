/**
 * Test fixture for CLI analyzer.
 *
 * Contains both:
 * - Decorated classes (class + decorator DSL)
 * - FormSpec exports (chain DSL)
 */

import { formspec, field, group } from "@formspec/dsl";
import type { InferFormSchema } from "@formspec/dsl";

// ============================================================================
// Chain DSL FormSpecs (exported for runtime loading)
// ============================================================================

/**
 * FormSpec for user registration.
 */
export const UserRegistrationForm = formspec(
  field.text("username", { label: "Username", required: true }),
  field.text("email", { label: "Email Address", required: true }),
  field.text("password", { label: "Password", required: true }),
  field.boolean("acceptTerms", { label: "Accept Terms", required: true })
);

/**
 * FormSpec for product configuration.
 */
export const ProductConfigForm = formspec(
  field.text("name", { label: "Product Name", required: true }),
  field.number("price", { label: "Price (cents)", min: 0 }),
  field.enum("status", ["draft", "active", "archived"] as const, {
    label: "Status",
  })
);

/**
 * FormSpec for method parameters.
 */
export const ActivateParams = formspec(
  field.number("amount", { label: "Amount (cents)", min: 100 }),
  field.number("installments", { label: "Number of Installments", min: 2, max: 12 })
);

export const CancelParams = formspec(
  field.enum("reason", ["user_request", "fraud", "other"] as const, {
    label: "Cancellation Reason",
  }),
  field.text("notes", { label: "Additional Notes" })
);

// ============================================================================
// Decorated Class (class + decorator DSL)
// ============================================================================

/**
 * Sample class with decorated fields and methods.
 */
export class InstallmentPlan {
  status!: "active" | "paused" | "canceled";

  amount!: number;

  customerEmail?: string;

  installments!: number;

  /**
   * Activates the plan with the given parameters.
   */
  activate(params: InferFormSchema<typeof ActivateParams>): { success: boolean } {
    console.log("Activating with", params);
    return { success: true };
  }

  /**
   * Cancels the plan.
   */
  cancelPlan(params: InferFormSchema<typeof CancelParams>): void {
    console.log("Canceling with reason:", params.reason);
  }

  /**
   * Static factory method.
   */
  static createStandard(name: string, amount: number): InstallmentPlan {
    const plan = new InstallmentPlan();
    plan.amount = amount;
    return plan;
  }
}

// ============================================================================
// Simple class without FormSpec method params (for testing static analysis only)
// ============================================================================

export class SimpleProduct {
  name!: string;

  price?: number;

  active!: boolean;

  tags?: string[];

  update(data: { name?: string; price?: number }): boolean {
    if (data.name) this.name = data.name;
    if (data.price) this.price = data.price;
    return true;
  }
}
