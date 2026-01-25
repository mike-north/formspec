/**
 * Path Type Utilities
 *
 * Goal: Enable type-safe field paths like:
 *   <NumberField path="percent_off" />        // Valid: percent_off is a number
 *   <NumberField path="name" />               // Error: name is a string
 *   <TextField path="max_discount.currency" /> // Valid: nested path to string
 *   <TextField path="does_not_exist" />       // Error: path doesn't exist
 */

/**
 * Primitive types that terminate path traversal
 */
type Primitive = string | number | boolean | null | undefined | Date;

/**
 * APPROACH 1: Simple dot-notation paths (no arrays)
 *
 * Recursively generates all valid dot-notation paths through an object type.
 * Stops at primitives and arrays.
 */
export type PathsOf<T, Prefix extends string = ""> = T extends Primitive
  ? never
  : T extends unknown[]
    ? never // Don't traverse into arrays for now
    : T extends object
      ? {
          [K in keyof T & string]:
            | (Prefix extends "" ? K : `${Prefix}.${K}`)
            | PathsOf<T[K], Prefix extends "" ? K : `${Prefix}.${K}`>;
        }[keyof T & string]
      : never;

/**
 * APPROACH 2: Get the type at a given path
 *
 * Given an object type T and a path string P, returns the type at that path.
 */
export type TypeAtPath<T, P extends string> = P extends `${infer Head}.${infer Tail}`
  ? Head extends keyof T
    ? TypeAtPath<T[Head], Tail>
    : never
  : P extends keyof T
    ? T[P]
    : never;

/**
 * APPROACH 3: Filter paths by value type
 *
 * Returns only paths that lead to a value assignable to V.
 */
export type PathsToType<T, V, Prefix extends string = ""> = T extends Primitive
  ? never
  : T extends unknown[]
    ? never
    : T extends object
      ? {
          [K in keyof T & string]:
            | (T[K] extends V ? (Prefix extends "" ? K : `${Prefix}.${K}`) : never)
            | PathsToType<T[K], V, Prefix extends "" ? K : `${Prefix}.${K}`>;
        }[keyof T & string]
      : never;

/**
 * Example schema from the spec
 */
export type CouponSchema = {
  name: string;
  percent_off: number;
  duration: "forever" | "once" | "repeating";
  duration_in_months: number | null;
  max_discount: {
    amount: number;
    currency: string;
  };
  applies_to: {
    products: string[];
    categories: string[];
  };
};

// ============================================================================
// Type Tests (verified by the compiler)
// ============================================================================

// Test: PathsOf generates all valid paths
type _AllPaths = PathsOf<CouponSchema>;
// Should be: "name" | "percent_off" | "duration" | "duration_in_months" |
//            "max_discount" | "max_discount.amount" | "max_discount.currency" |
//            "applies_to" | "applies_to.products" | "applies_to.categories"

// Verify specific paths are included
const _pathName: _AllPaths = "name";
const _pathPercentOff: _AllPaths = "percent_off";
const _pathMaxDiscount: _AllPaths = "max_discount";
const _pathMaxDiscountAmount: _AllPaths = "max_discount.amount";
const _pathMaxDiscountCurrency: _AllPaths = "max_discount.currency";
const _pathAppliesTo: _AllPaths = "applies_to";
const _pathAppliesToProducts: _AllPaths = "applies_to.products";
void [_pathName, _pathPercentOff, _pathMaxDiscount, _pathMaxDiscountAmount];
void [_pathMaxDiscountCurrency, _pathAppliesTo, _pathAppliesToProducts];

// Test: TypeAtPath resolves correctly
type _NameType = TypeAtPath<CouponSchema, "name">;
const _checkNameType: _NameType = "test";
void _checkNameType;

type _PercentOffType = TypeAtPath<CouponSchema, "percent_off">;
const _checkPercentOffType: _PercentOffType = 42;
void _checkPercentOffType;

type _MaxDiscountAmountType = TypeAtPath<CouponSchema, "max_discount.amount">;
const _checkMaxDiscountAmountType: _MaxDiscountAmountType = 100;
void _checkMaxDiscountAmountType;

type _MaxDiscountCurrencyType = TypeAtPath<CouponSchema, "max_discount.currency">;
const _checkMaxDiscountCurrencyType: _MaxDiscountCurrencyType = "USD";
void _checkMaxDiscountCurrencyType;

// Test: PathsToType filters correctly
type _NumberPaths = PathsToType<CouponSchema, number>;
// Should be: "percent_off" | "max_discount.amount"
// Note: duration_in_months is `number | null`, not `number`, so it's excluded

const _numberPath1: _NumberPaths = "percent_off";
const _numberPath2: _NumberPaths = "max_discount.amount";
void [_numberPath1, _numberPath2];

type _StringPaths = PathsToType<CouponSchema, string>;
// Should be: "name" | "max_discount.currency"

const _stringPath1: _StringPaths = "name";
const _stringPath2: _StringPaths = "max_discount.currency";
void [_stringPath1, _stringPath2];
