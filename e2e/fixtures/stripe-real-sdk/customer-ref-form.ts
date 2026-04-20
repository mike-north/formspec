/**
 * Real-SDK Stripe stress-test fixture for the Ref<Customer> OOM investigation.
 *
 * This fixture uses REAL types from the `stripe` npm package (not hand-authored
 * stubs) to verify whether the external-type bypass in `extractReferenceTypeArguments`
 * (PR #308, `packages/build/src/analyzer/class-analyzer.ts`) engages correctly
 * when type arguments reference types from `node_modules/stripe/...`.
 *
 * Motivation: Users reported OOM when building schemas for classes with
 * `Ref<Stripe.Customer>`-style fields backed by real SDK types. The synthetic
 * fixture in `e2e/fixtures/stripe-ref-customer/` uses hand-authored Stripe-like
 * types (tiny compared to the real SDK) and does NOT reproduce the bug. This
 * fixture closes that gap.
 *
 * The `Ref<T>` wrapper below uses the same `__type` phantom-property convention
 * as the synthetic fixture (see `stripe-ref-customer/stripe-like-types.ts`). The
 * `__` prefix is load-bearing: `class-analyzer.ts` skips all `__`-prefixed
 * properties during IR emission, so `__type` never appears in generated JSON
 * Schema while still making `T` visible to generic-reference resolution.
 *
 * Field summary (~15 primitive fields + 5 Ref<T> fields + 1 nested object):
 *   - 1  Ref<Stripe.Customer>         — primary trigger; largest real SDK type
 *   - 1  Ref<Stripe.PaymentMethod>    — large discriminated-union type
 *   - 1  Ref<Stripe.Subscription>     — also large
 *   - 1  Ref<Stripe.Invoice>          — largest type in the SDK type graph
 *   - 1  Ref<Stripe.TaxId>            — moderate size
 *   - 1  nested object (RealSdkBillingAddress) with its own Ref<Stripe.Customer>
 *   - ~15 primitive fields with standard constraint tags
 *
 * @see e2e/benchmarks/stripe-real-sdk-bench.ts — runner and OOM detection
 * @see e2e/fixtures/stripe-ref-customer/STUB_NOTE.md — rationale for Ref<T> approach
 * @see packages/build/src/analyzer/class-analyzer.ts extractReferenceTypeArguments
 */

import type Stripe from "stripe";

// =============================================================================
// Ref<T> — phantom wrapper for expandable-field polymorphism
// =============================================================================

/**
 * Ref<T> represents an expandable field in the Stripe API.
 *
 * The `__type` phantom property carries the generic type argument for
 * FormSpec's external-type bypass in `extractReferenceTypeArguments` (PR #308).
 * The `__` prefix is load-bearing — `class-analyzer.ts` excludes `__`-prefixed
 * properties from Canonical IR emission.
 */
export interface Ref<T> {
  /**
   * The Stripe object ID when the field is unexpanded.
   */
  readonly id: string;
  /**
   * True when the full resource object has been loaded.
   */
  readonly expanded: boolean;
  /**
   * Phantom field. Carries the generic type argument T to make it visible to
   * `extractReferenceTypeArguments` without triggering full type-graph recursion
   * on the (large) SDK type. The `__` prefix causes class-analyzer.ts to skip
   * this field during IR emission.
   */
  readonly __type?: T;
}

// =============================================================================
// Nested supporting type — exercises Ref<T> inside an object field
// =============================================================================

/**
 * Billing address collected at checkout time. Contains a nested Ref<Stripe.Customer>
 * to exercise the external-type bypass path inside a nested object walk.
 */
interface RealSdkBillingAddress {
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
   * Back-reference to the owning customer. Tests the bypass path inside nested
   * object analysis — mirrors the `CheckoutAddress.ownerRef` field in the
   * synthetic fixture.
   */
  ownerRef: Ref<Stripe.Customer>;
}

// =============================================================================
// Main fixture class
// =============================================================================

/**
 * Real-SDK Stripe stress-test form fixture.
 *
 * Used by `e2e/benchmarks/stripe-real-sdk-bench.ts` to measure peak RSS,
 * wall time, and OOM behaviour under the full FormSpec build pipeline when
 * `Ref<T>` fields reference REAL types from the `stripe` npm package.
 *
 * The external-type bypass in `extractReferenceTypeArguments` (PR #308) should
 * fire for every `Ref<Stripe.*>` field because the Stripe types are declared in
 * `node_modules/stripe/...` — a different file from the analysis root. If the
 * bypass does NOT fire, the analyzer walks the full Stripe type graph and may
 * exhaust memory.
 *
 * See `e2e/benchmarks/stripe-real-sdk-bench.ts` §Phase 4 gate for acceptance
 * criteria.
 */
export class RealSdkCustomerRefForm {
  // =========================================================================
  // Ref<Stripe.*> fields — primary stress drivers (5)
  // =========================================================================

  /**
   * The primary Stripe customer. `Stripe.Customer` is one of the largest types
   * in the SDK — deeply nested with many optional sub-objects.
   */
  customer!: Ref<Stripe.Customer>;

  /**
   * Primary payment method. `Stripe.PaymentMethod` is a large discriminated
   * union over many payment method types (card, bank_transfer, sepa_debit, etc.).
   */
  paymentMethod?: Ref<Stripe.PaymentMethod>;

  /**
   * Active subscription. `Stripe.Subscription` includes nested items list,
   * plan, price, and schedule references.
   */
  subscription?: Ref<Stripe.Subscription>;

  /**
   * Most recent invoice. `Stripe.Invoice` is the largest type in the SDK with
   * deeply nested line items, charge, and payment intent references.
   */
  invoice?: Ref<Stripe.Invoice>;

  /**
   * Tax identifier on the customer record. `Stripe.TaxId` is moderate-sized.
   */
  taxId?: Ref<Stripe.TaxId>;

  // =========================================================================
  // Constrained string fields (6)
  // =========================================================================

  /**
   * Internal reference code.
   *
   * @minLength 3
   * @maxLength 64
   * @pattern ^[A-Za-z0-9_\-]+$
   */
  referenceCode!: string;

  /**
   * Customer display name.
   *
   * @minLength 1
   * @maxLength 200
   */
  displayName!: string;

  /**
   * Contact email.
   *
   * @minLength 5
   * @maxLength 254
   * @pattern ^[^@\s]+@[^@\s]+\.[^@\s]+$
   */
  email!: string;

  /**
   * E.164 phone number.
   *
   * @minLength 7
   * @maxLength 20
   * @pattern ^\+?[0-9\s\-().]{7,20}$
   */
  phone?: string;

  /**
   * ISO 3166-1 alpha-2 billing country.
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
  // Constrained numeric fields (5)
  // =========================================================================

  /**
   * Outstanding balance in smallest currency unit (cents). Negative = credit.
   *
   * @minimum -999999999
   * @maximum 999999999
   */
  balanceCents!: number;

  /**
   * Credit limit in cents.
   *
   * @minimum 0
   * @maximum 5000000
   * @multipleOf 100
   */
  creditLimitCents!: number;

  /**
   * Number of successful charges.
   *
   * @minimum 0
   * @maximum 99999
   */
  successfulChargeCount!: number;

  /**
   * Lifetime value in cents.
   *
   * @minimum 0
   * @maximum 999999999
   */
  lifetimeValueCents!: number;

  /**
   * Fraud risk score (0.00–1.00).
   *
   * @minimum 0
   * @maximum 1
   * @multipleOf 0.0001
   */
  riskScore!: number;

  // =========================================================================
  // Enum / literal-union fields (2)
  // =========================================================================

  /**
   * How the customer prefers to be contacted.
   *
   * @enumOptions [{"id":"email","label":"Email"},{"id":"sms","label":"SMS"},{"id":"phone","label":"Phone"},{"id":"none","label":"None"}]
   */
  contactPreference!: "email" | "sms" | "phone" | "none";

  /** Account status. */
  accountStatus!: "active" | "suspended" | "closed";

  // =========================================================================
  // Boolean flags (2)
  // =========================================================================

  /** Whether the customer account is delinquent. */
  isDelinquent!: boolean;

  /** Whether the customer has completed identity verification. */
  identityVerified!: boolean;

  // =========================================================================
  // Nested object with Ref<Stripe.Customer> inside (1)
  // =========================================================================

  /**
   * Primary billing address, including a back-reference to the owning customer.
   * Exercises the external-type bypass path inside a nested object walk.
   */
  billingAddress?: RealSdkBillingAddress;

  // =========================================================================
  // Freeform metadata (1)
  // =========================================================================

  /**
   * Arbitrary key-value metadata.
   */
  metadata!: Record<string, string>;
}
