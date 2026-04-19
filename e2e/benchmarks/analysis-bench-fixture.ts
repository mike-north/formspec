/**
 * Microbenchmark fixture for Phase 0-C: analysis-pipeline baseline.
 *
 * 20 fields covering the full constraint-tag vocabulary exercised by the
 * synthetic-checker retirement refactor (see docs/refactors/synthetic-checker-retirement.md §8.2).
 *
 * Field breakdown:
 *   - 8 numeric fields:  @minimum, @maximum, @exclusiveMinimum, @exclusiveMaximum, @multipleOf
 *   - 4 string fields:   @minLength, @maxLength, @pattern
 *   - 2 array fields:    @minItems, @maxItems, @uniqueItems
 *   - 2 enum-ish fields: @enumOptions
 *   - 2 const fields:    @const
 *   - 2 path-target:     @minimum/:minLength :nested.property value
 */

/** Nested monetary amount used by path-target fields. */
interface MonetaryAmount {
  amount: number;
  currency: string;
}

/** Fulfillment status code (string union). */
interface FulfillmentStatus {
  code: string;
  label: string;
}

/** Shipping carrier option. */
type ShippingCarrierOption = "fedex" | "ups" | "usps";

/** Payment method option. */
type PaymentMethodOption = "card" | "ach" | "wallet";

/**
 * Analysis microbenchmark fixture — representative 20-field interface.
 *
 * Every builtin constraint tag appears at least once so the synthetic-checker
 * validation path is exercised in full.
 */
export interface AnalysisBenchFixture {
  // -----------------------------------------------------------------------
  // Numeric fields (8)
  // -----------------------------------------------------------------------

  /**
   * Customer age in years.
   *
   * @minimum 0
   * @maximum 120
   */
  age: number;

  /**
   * Product price in cents.
   *
   * @minimum 0
   * @exclusiveMaximum 1000000
   */
  priceInCents: number;

  /**
   * Discount percentage applied to the order.
   *
   * @exclusiveMinimum 0
   * @maximum 100
   */
  discountPercent: number;

  /**
   * Inventory quantity available for shipping.
   *
   * @minimum 0
   * @maximum 99999
   * @multipleOf 1
   */
  stockQuantity: number;

  /**
   * Weight of the shipment in kilograms.
   *
   * @exclusiveMinimum 0
   * @exclusiveMaximum 1000
   * @multipleOf 0.001
   */
  weightKg: number;

  /**
   * Tax rate as a decimal fraction.
   *
   * @minimum 0
   * @maximum 1
   * @multipleOf 0.0001
   */
  taxRate: number;

  /**
   * Credit limit in whole currency units.
   *
   * @minimum 0
   * @maximum 500000
   * @multipleOf 100
   */
  creditLimit: number;

  /**
   * Shipping zone index.
   *
   * @minimum 1
   * @maximum 9
   * @multipleOf 1
   */
  shippingZone: number;

  // -----------------------------------------------------------------------
  // String fields (4)
  // -----------------------------------------------------------------------

  /**
   * Customer's full legal name.
   *
   * @minLength 1
   * @maxLength 200
   */
  fullName: string;

  /**
   * Contact email address.
   *
   * @minLength 5
   * @maxLength 254
   * @pattern ^[^@\s]+@[^@\s]+\.[^@\s]+$
   */
  email: string;

  /**
   * International phone number with country code.
   *
   * @minLength 7
   * @maxLength 20
   * @pattern ^\+?[0-9\s\-().]{7,20}$
   */
  phoneNumber: string;

  /**
   * ISO 4217 currency code.
   *
   * @minLength 3
   * @maxLength 3
   * @pattern ^[A-Z]{3}$
   */
  currencyCode: string;

  // -----------------------------------------------------------------------
  // Array fields (2)
  // -----------------------------------------------------------------------

  /**
   * Product category tags applied to the order line.
   *
   * @minItems 1
   * @maxItems 10
   * @uniqueItems
   */
  categoryTags: string[];

  /**
   * Ordered list of warehouse fulfillment steps.
   *
   * @minItems 0
   * @maxItems 50
   */
  fulfillmentSteps: string[];

  // -----------------------------------------------------------------------
  // Enum-ish fields (2)
  // -----------------------------------------------------------------------

  /**
   * Allowed shipping carriers for this order.
   *
   * @enumOptions [{"value":"fedex","label":"FedEx"},{"value":"ups","label":"UPS"},{"value":"usps","label":"USPS"}]
   */
  shippingCarrier: ShippingCarrierOption;

  /**
   * Payment method options accepted at checkout.
   *
   * @enumOptions [{"value":"card","label":"Credit Card"},{"value":"ach","label":"Bank Transfer"},{"value":"wallet","label":"Digital Wallet"}]
   */
  paymentMethod: PaymentMethodOption;

  // -----------------------------------------------------------------------
  // Const fields (2)
  // -----------------------------------------------------------------------

  /**
   * Schema version — always "v2" for this fixture.
   *
   * @const "v2"
   */
  schemaVersion: string;

  /**
   * Maximum allowed revision depth before archival.
   *
   * @const 10
   */
  maxRevisionDepth: number;

  // -----------------------------------------------------------------------
  // Path-target fields (2)
  // -----------------------------------------------------------------------

  /**
   * Total order amount with currency.
   *
   * @minimum :amount 0
   * @maximum :amount 9999999.99
   * @minLength :currency 3
   * @maxLength :currency 3
   */
  totalAmount: MonetaryAmount;

  /**
   * Refund details with fulfillment status code label.
   *
   * @minLength :code 2
   * @maxLength :code 20
   * @minLength :label 1
   * @maxLength :label 100
   */
  refundDetails: FulfillmentStatus;
}
