/**
 * Stripe Ref<Customer> stress-test fixture for Phase 0 baseline (§8.4 / 0.5l).
 *
 * This file is the acceptance gate for generic-reference handling in Phase 4
 * of the synthetic-checker retirement refactor.
 *
 * See `docs/refactors/synthetic-checker-retirement.md` §8.4 for full criteria.
 * See `STUB_NOTE.md` in this directory for the resolvePayload stub rationale.
 *
 * Field summary (30 total):
 *   - 1  Ref<Customer>          — core generic-reference field
 *   - 2  Ref<PaymentMethod>     — expandable payment method references
 *   - 1  Ref<Subscription>      — expandable subscription reference
 *   - 1  Ref<Invoice>           — expandable invoice reference (with @description)
 *   - 1  nested object (shipping address) with its own Ref<Customer> field
 *   - 6  constrained strings    — @minLength, @maxLength, @pattern
 *   - 6  constrained numbers    — @minimum, @maximum, @multipleOf
 *   - 4  optional / nullable fields
 *   - 4  enum / literal-union fields
 *   - 3  boolean flags
 *   - 1  Record<string, string> metadata
 */

import type {
  Ref,
  Customer,
  PaymentMethod,
  Subscription,
  Invoice,
  TaxExemptStatus,
  SubscriptionStatus,
  CardBrand,
} from "./stripe-like-types.js";

// =============================================================================
// Inline supporting types — used for nested-object fields
// =============================================================================

/** Shipping address fields collected at checkout time. */
interface CheckoutAddress {
  /** @minLength 1 @maxLength 200 */
  line1: string;
  /** @maxLength 200 */
  line2?: string;
  /** @minLength 1 @maxLength 100 */
  city: string;
  /** @minLength 2 @maxLength 2 @pattern ^[A-Z]{2}$ */
  countryCode: string;
  /** @minLength 3 @maxLength 10 @pattern ^[A-Za-z0-9 \-]{3,10}$ */
  postalCode: string;
  /**
   * Reference to the customer who owns this address — demonstrates a nested
   * Ref<T> field inside an object, exercising the type-argument bypass path
   * in `extractReferenceTypeArguments`.
   */
  ownerRef: Ref<Customer>;
}

// =============================================================================
// Main fixture class — 30 fields
// =============================================================================

/**
 * Stripe `Ref<Customer>` stress-test form fixture.
 *
 * Used by `e2e/benchmarks/stripe-ref-customer-bench.ts` to measure
 * peak RSS, wall time, and OOM behaviour under the full FormSpec build
 * pipeline with generic-reference resolution active.
 *
 * See §8.4 of `docs/refactors/synthetic-checker-retirement.md` for
 * acceptance gates and phase comparison targets.
 */
export class CustomerRefForm {
  // =========================================================================
  // Generic reference fields (5) — these are the primary stress drivers
  // =========================================================================

  /**
   * The primary Stripe customer being referenced.
   *
   * This field exercises the `extractReferenceTypeArguments` external-type
   * bypass introduced in PR #308: `Customer` is declared in
   * `stripe-like-types.ts` (a different analysis file), so the analyzer emits
   * an opaque `{ kind: "reference", name: "Customer", typeArguments: [] }`
   * node instead of recursing into the full Customer declaration.
   */
  customer!: Ref<Customer>;

  /**
   * Primary payment method on file.
   *
   * @description The default payment method attached to this customer.
   */
  defaultPaymentMethod!: Ref<PaymentMethod>;

  /**
   * Backup payment method for retry logic.
   */
  backupPaymentMethod?: Ref<PaymentMethod>;

  /**
   * Active subscription, if any.
   */
  activeSubscription?: Ref<Subscription>;

  /**
   * Most recent invoice.
   *
   * @description The latest invoice generated for this customer, including
   * any pending charges.
   */
  latestInvoice?: Ref<Invoice>;

  // =========================================================================
  // Constrained string fields (6)
  // =========================================================================

  /**
   * Internal reference code for the customer record.
   *
   * @minLength 3
   * @maxLength 64
   * @pattern ^[A-Za-z0-9_\-]+$
   */
  referenceCode!: string;

  /**
   * Customer's display name as shown in the dashboard.
   *
   * @minLength 1
   * @maxLength 200
   */
  displayName!: string;

  /**
   * Primary contact email address.
   *
   * @minLength 5
   * @maxLength 254
   * @pattern ^[^@\s]+@[^@\s]+\.[^@\s]+$
   */
  email!: string;

  /**
   * E.164-formatted phone number.
   *
   * @minLength 7
   * @maxLength 20
   * @pattern ^\+?[0-9\s\-().]{7,20}$
   */
  phone?: string;

  /**
   * ISO 3166-1 alpha-2 country code for the billing address.
   *
   * @minLength 2
   * @maxLength 2
   * @pattern ^[A-Z]{2}$
   */
  billingCountry!: string;

  /**
   * ISO 4217 currency code (lowercase).
   *
   * @minLength 3
   * @maxLength 3
   * @pattern ^[a-z]{3}$
   */
  currency!: string;

  // =========================================================================
  // Constrained numeric fields (6)
  // =========================================================================

  /**
   * Customer's outstanding balance in the smallest currency unit (e.g. cents).
   * Negative values indicate credits.
   *
   * @minimum -999999999
   * @maximum 999999999
   */
  balanceCents!: number;

  /**
   * Credit limit extended to this customer, in cents.
   *
   * @minimum 0
   * @maximum 5000000
   * @multipleOf 100
   */
  creditLimitCents!: number;

  /**
   * Number of successful charges recorded for this customer.
   *
   * @minimum 0
   * @maximum 99999
   * @multipleOf 1
   */
  successfulChargeCount!: number;

  /**
   * Number of failed charge attempts, used for risk scoring.
   *
   * @minimum 0
   * @maximum 999
   * @multipleOf 1
   */
  failedChargeCount!: number;

  /**
   * Lifetime value of the customer in cents.
   *
   * @minimum 0
   * @maximum 999999999
   * @multipleOf 1
   */
  lifetimeValueCents!: number;

  /**
   * Risk score computed by the fraud-detection model (0.00–1.00).
   *
   * @minimum 0
   * @maximum 1
   * @multipleOf 0.0001
   */
  riskScore!: number;

  // =========================================================================
  // Enum / literal-union fields (4)
  // =========================================================================

  /** Tax-exempt status for the customer. */
  taxExempt!: TaxExemptStatus;

  /** Status of the customer's active subscription. */
  subscriptionStatus?: SubscriptionStatus;

  /** Preferred card brand for display purposes. */
  preferredCardBrand?: CardBrand;

  /**
   * How the customer prefers to be contacted.
   *
   * @enumOptions [{"id":"email","label":"Email"},{"id":"sms","label":"SMS"},{"id":"phone","label":"Phone"},{"id":"none","label":"None"}]
   */
  contactPreference!: "email" | "sms" | "phone" | "none";

  // =========================================================================
  // Boolean flags (3)
  // =========================================================================

  /** Whether the customer account is currently delinquent. */
  isDelinquent!: boolean;

  /** Whether the customer has opted in to marketing communications. */
  marketingOptIn!: boolean;

  /** Whether the customer has completed identity verification. */
  identityVerified!: boolean;

  // =========================================================================
  // Nested object field (1) — exercises Ref<T> inside a nested object
  // =========================================================================

  /**
   * Primary shipping address for this customer, including a back-reference
   * to the owning customer (Ref<Customer> inside a nested object).
   */
  shippingAddress?: CheckoutAddress;

  // =========================================================================
  // Metadata / freeform (1)
  // =========================================================================

  /**
   * Arbitrary key-value metadata attached to this customer record.
   * Values must be strings; keys must be non-empty.
   */
  metadata!: Record<string, string>;

  // =========================================================================
  // Optional / nullable supplemental fields (4)
  // =========================================================================

  /**
   * Internal CRM account ID for cross-system linking.
   *
   * @minLength 1
   * @maxLength 128
   */
  crmAccountId?: string;

  /**
   * Unix timestamp of when the customer was first created.
   *
   * @minimum 0
   */
  createdAt?: number;

  /**
   * Unix timestamp of the most recent update.
   *
   * @minimum 0
   */
  updatedAt?: number;

  /**
   * Human-readable note left by a support agent.
   *
   * @maxLength 1000
   */
  supportNote?: string;
}
