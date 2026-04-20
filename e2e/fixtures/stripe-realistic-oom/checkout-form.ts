import type Stripe from "stripe";

/**
 * Realistic checkout form modeled after how a consumer app would integrate
 * formspec with the Stripe node SDK. Stripe types are embedded directly —
 * this is the code path that reportedly OOMs in real user projects.
 *
 * Unlike the e2e/fixtures/stripe-ref-customer/ fixture (which uses a Ref<T>
 * wrapper with a __type phantom property to engage PR #308's external-type
 * bypass), this fixture deliberately does NOT use that wrapper — so the
 * analyzer has to walk real Stripe.Customer / Stripe.Invoice / etc. and
 * emit schema content for them.
 */
export class CheckoutForm {
  /** @minLength 1 */
  orderId!: string;

  /** Customer record from Stripe */
  customer!: Stripe.Customer;

  /** Chosen payment method */
  paymentMethod!: Stripe.PaymentMethod;

  /** Attached subscription, if this is a recurring order */
  subscription?: Stripe.Subscription;

  /** Invoice preview for this order */
  invoicePreview!: Stripe.Invoice;

  /** Customer tax ID (for B2B sales) */
  taxId?: Stripe.TaxId;

  /** @minimum 0 @maximum 1000000 */
  subtotalCents!: number;

  /** @minimum 0 */
  discountCents!: number;

  /** @pattern "^[A-Z]{3}$" */
  currency!: string;

  /** @minLength 0 @maxLength 500 */
  shippingNotes?: string;

  confirmed!: boolean;
}
