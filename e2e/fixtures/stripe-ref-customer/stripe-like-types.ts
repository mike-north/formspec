/**
 * Self-contained Stripe-like type definitions for the Ref<Customer> stress-test fixture.
 *
 * These types mirror the structure of the real `stripe` npm SDK — deeply nested objects,
 * optional fields, discriminated-union metadata, and expandable-field polymorphism —
 * without importing the SDK itself. This keeps the fixture self-contained and avoids
 * adding `stripe` as a production dependency of `@formspec/e2e`.
 *
 * When the real `stripe` SDK becomes available as a peer dep (see STUB_NOTE.md), replace
 * these hand-authored types with the corresponding `Stripe.*` imports and verify the
 * baseline numbers are still in range.
 *
 * Field count: ~80 properties across the type graph. The form fixture selects a
 * representative cross-section of ~30 fields through `CustomerRefForm`.
 */

// =============================================================================
// Core Stripe primitives
// =============================================================================

/** Unix epoch timestamp (seconds since 1970-01-01T00:00:00Z). */
export type Timestamp = number;

/** ISO 4217 currency code, lowercase (e.g. "usd", "eur"). */
export type Currency = string;

/** Stripe object ID prefix for customers (cus_*). */
export type CustomerId = string;

/** Stripe object ID prefix for payment methods (pm_*). */
export type PaymentMethodId = string;

/** Stripe object ID prefix for addresses. */
export type AddressId = string;

/** Stripe object ID prefix for invoices (in_*). */
export type InvoiceId = string;

/** Stripe object ID prefix for subscriptions (sub_*). */
export type SubscriptionId = string;

// =============================================================================
// Nested supporting types (simulate complex SDK sub-objects)
// =============================================================================

/** ISO 3166-1 alpha-2 country code. */
export interface Country {
  /** Two-letter country code. */
  readonly code: string;
  /** Human-readable country name. */
  readonly name: string;
}

/** A physical or billing address, as returned by the Stripe API. */
export interface StripeAddress {
  /** Address line 1 (street address, PO box, company name). */
  readonly line1: string | null;
  /** Address line 2 (apartment, suite, unit, building, floor). */
  readonly line2: string | null;
  /** City, district, suburb, town, or village. */
  readonly city: string | null;
  /** State, county, province, or region. */
  readonly state: string | null;
  /** ZIP or postal code. */
  readonly postalCode: string | null;
  /** Two-letter country code (ISO 3166-1 alpha-2). */
  readonly country: Country;
}

/** A card funding source. */
export type CardBrand = "visa" | "mastercard" | "amex" | "discover" | "jcb" | "unionpay" | "unknown";

/** Card payment method details. */
export interface CardPaymentMethod {
  readonly brand: CardBrand;
  /** Two-digit expiry month (1–12). */
  readonly expMonth: number;
  /** Four-digit expiry year. */
  readonly expYear: number;
  /** Last four digits of the card number. */
  readonly last4: string;
  /** Three-letter ISO code for the country of the card issuer. */
  readonly country: string | null;
  /** Card fingerprint — unique per card number. */
  readonly fingerprint: string | null;
}

/** Bank account payment method details. */
export interface BankAccountPaymentMethod {
  readonly bankName: string | null;
  readonly routingNumber: string | null;
  readonly last4: string;
  readonly country: string;
  readonly currency: Currency;
}

/** A polymorphic payment method — either a card or a bank account. */
export type PaymentMethodDetails =
  | { readonly type: "card"; readonly card: CardPaymentMethod }
  | { readonly type: "us_bank_account"; readonly usBankAccount: BankAccountPaymentMethod };

/** A stored payment method on a customer. */
export interface PaymentMethod {
  readonly id: PaymentMethodId;
  readonly object: "payment_method";
  readonly created: Timestamp;
  readonly livemode: boolean;
  readonly details: PaymentMethodDetails;
  readonly billingDetails: {
    readonly address: StripeAddress | null;
    readonly email: string | null;
    readonly name: string | null;
    readonly phone: string | null;
  };
}

/** Subscription status. */
export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "past_due"
  | "paused"
  | "trialing"
  | "unpaid";

/** A recurring subscription. */
export interface Subscription {
  readonly id: SubscriptionId;
  readonly object: "subscription";
  readonly status: SubscriptionStatus;
  readonly currentPeriodStart: Timestamp;
  readonly currentPeriodEnd: Timestamp;
  readonly canceledAt: Timestamp | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly currency: Currency;
  readonly livemode: boolean;
}

/** Invoice status. */
export type InvoiceStatus = "draft" | "open" | "paid" | "uncollectible" | "void";

/** A Stripe invoice. */
export interface Invoice {
  readonly id: InvoiceId;
  readonly object: "invoice";
  readonly status: InvoiceStatus | null;
  readonly amountDue: number;
  readonly amountPaid: number;
  readonly amountRemaining: number;
  readonly currency: Currency;
  readonly created: Timestamp;
  readonly dueDate: Timestamp | null;
  readonly periodStart: Timestamp;
  readonly periodEnd: Timestamp;
}

/** Customer tax-exempt status. */
export type TaxExemptStatus = "exempt" | "none" | "reverse";

/** Tax ID type. */
export type TaxIdType =
  | "ad_nrt"
  | "ae_trn"
  | "au_abn"
  | "au_arn"
  | "eu_vat"
  | "gb_vat"
  | "us_ein"
  | "unknown";

/** A tax identifier. */
export interface TaxId {
  readonly type: TaxIdType;
  readonly value: string;
  readonly country: string | null;
}

/** Key-value metadata attached to Stripe objects. */
export type StripeMetadata = Record<string, string>;

/** Discount applied to a customer. */
export interface Discount {
  readonly id: string;
  readonly object: "discount";
  readonly couponId: string;
  readonly start: Timestamp;
  readonly end: Timestamp | null;
  readonly percentOff: number | null;
  readonly amountOff: number | null;
}

/** A Stripe customer object — the core entity in the type graph. */
export interface Customer {
  readonly id: CustomerId;
  readonly object: "customer";
  readonly created: Timestamp;
  readonly livemode: boolean;
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly description: string | null;
  readonly currency: Currency | null;
  readonly address: StripeAddress | null;
  readonly shipping: {
    readonly address: StripeAddress;
    readonly name: string;
    readonly phone: string | null;
  } | null;
  readonly balance: number;
  readonly delinquent: boolean | null;
  readonly taxExempt: TaxExemptStatus;
  readonly taxIds: readonly TaxId[];
  readonly metadata: StripeMetadata;
  readonly preferredLocales: readonly string[];
  readonly defaultSource: string | null;
  readonly invoicePrefix: string | null;
  readonly nextInvoiceSequence: number | null;
  readonly discount: Discount | null;
  readonly testClock: string | null;
}

// =============================================================================
// Ref<T> wrapper — phantom type for expandable-field polymorphism
// =============================================================================

/**
 * Ref<T> represents an expandable field in the Stripe API.
 *
 * When unexpanded, the field contains only the resource ID string.
 * When expanded, the field contains the full resource object.
 *
 * FormSpec treats Ref<T> as an opaque wrapper type. The generic
 * parameter `T` is carried via the `__type` phantom property and does
 * NOT trigger full expansion of the external type — this is the path
 * guarded by the `extractReferenceTypeArguments` external-type bypass
 * (PR #308, `e2e/fixtures/stripe-ref-customer/STUB_NOTE.md`).
 * The `__` prefix on `__type` is load-bearing: `class-analyzer.ts`
 * skips all `__`-prefixed properties during IR emission.
 */
export interface Ref<T> {
  /**
   * The Stripe object ID when the field is unexpanded.
   * When expanded, this is the full resource object.
   */
  readonly id: string;
  /**
   * True when the full resource object has been loaded; false when only
   * the ID is present.
   */
  readonly expanded: boolean;
  /**
   * Phantom field carrying the generic type argument for FormSpec's
   * external-type bypass (`extractReferenceTypeArguments`, PR #308).
   * The `__` prefix is load-bearing: `class-analyzer.ts` excludes all
   * `__`-prefixed properties from Canonical IR emission, so this field
   * never appears in generated JSON Schema while still making `T`
   * visible to generic-reference resolution.
   */
  readonly __type?: T;
}
