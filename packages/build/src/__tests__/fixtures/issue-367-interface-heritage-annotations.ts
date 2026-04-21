/**
 * Test fixtures for issue #367 — type-level TSDoc annotations should be
 * inherited when one interface extends another.
 *
 * @see https://github.com/mike-north/formspec/issues/367
 */

// ---------------------------------------------------------------------------
// Base case: single-level extends — derived type inherits base annotations
// ---------------------------------------------------------------------------

/** @format monetary-amount */
export interface MonetaryAmount {
  /** @displayName Amount */
  amount: string;
  /** @displayName Currency */
  currency: string;
}

/** Derived type that must inherit the base type-level format annotation */
export interface PositiveMonetaryAmount extends MonetaryAmount {
  /** @displayName Positive Amount */
  amount: string;
}

/** Host class that references the derived type */
export class MinAmountConfig {
  minimumAmount!: PositiveMonetaryAmount;
}

// ---------------------------------------------------------------------------
// Multi-level inheritance: A → B → C
// ---------------------------------------------------------------------------

/** @format monetary-amount */
export interface BaseAmount {
  /** @displayName Value */
  value: string;
  /** @displayName Currency */
  currency: string;
}

/** Intermediate level — no extra type-level annotations */
export interface MidAmount extends BaseAmount {
  /** @displayName Mid Value */
  value: string;
}

/** Deepest level — must still carry the grandparent's format annotation */
export interface ConstrainedAmount extends MidAmount {
  /** @displayName Constrained Value */
  value: string;
}

export class MultiLevelConfig {
  amount!: ConstrainedAmount;
}

// ---------------------------------------------------------------------------
// Multiple extends: interface X extends A, B — merges both bases' annotations
// ---------------------------------------------------------------------------

/** @format monetary-amount */
export interface WithFormat {
  value: string;
}

/** @displayName Payment amount */
export interface WithDisplayName {
  value: string;
}

/** Merges annotations from both base interfaces */
export interface MultiBaseAmount extends WithFormat, WithDisplayName {
  amount: string;
}

export class MultiExtendsConfig {
  amount!: MultiBaseAmount;
}

// ---------------------------------------------------------------------------
// Derived overrides base: derived annotation wins on same annotationKind
// ---------------------------------------------------------------------------

/** @format monetary-amount */
export interface GenericAmount {
  value: string;
}

/**
 * Overrides the base type's format annotation.
 * @format positive-monetary-amount
 */
export interface SpecificAmount extends GenericAmount {
  /** @displayName Specific Value */
  value: string;
}

export class OverrideConfig {
  amount!: SpecificAmount;
}

// ---------------------------------------------------------------------------
// Negative case: no base annotations — derived type carries only its own
// ---------------------------------------------------------------------------

export interface PlainBase {
  value: string;
}

/** @format widget */
export interface PlainDerived extends PlainBase {
  /** @displayName Widget Value */
  value: string;
}

export class PlainConfig {
  amount!: PlainDerived;
}
