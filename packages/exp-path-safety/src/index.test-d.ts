/**
 * tsd type tests for path safety
 */

import { expectType, expectError, expectAssignable } from "tsd";
import type { PathsOf, TypeAtPath, PathsToType, CouponSchema } from "./index.js";

// ============================================================================
// PathsOf tests
// ============================================================================

// Positive: Top-level paths are valid
expectAssignable<PathsOf<CouponSchema>>("name");
expectAssignable<PathsOf<CouponSchema>>("percent_off");
expectAssignable<PathsOf<CouponSchema>>("duration");
expectAssignable<PathsOf<CouponSchema>>("duration_in_months");
expectAssignable<PathsOf<CouponSchema>>("max_discount");
expectAssignable<PathsOf<CouponSchema>>("applies_to");

// Positive: Nested paths are valid
expectAssignable<PathsOf<CouponSchema>>("max_discount.amount");
expectAssignable<PathsOf<CouponSchema>>("max_discount.currency");
expectAssignable<PathsOf<CouponSchema>>("applies_to.products");
expectAssignable<PathsOf<CouponSchema>>("applies_to.categories");

// Negative: Invalid paths are rejected
// @ts-expect-error - path doesn't exist
const _badPath1: PathsOf<CouponSchema> = "does_not_exist";
// @ts-expect-error - typo in path
const _badPath2: PathsOf<CouponSchema> = "max_dicount.amount";
// @ts-expect-error - path doesn't exist at this depth
const _badPath3: PathsOf<CouponSchema> = "max_discount.invalid";
// @ts-expect-error - path goes too deep
const _badPath4: PathsOf<CouponSchema> = "max_discount.amount.invalid";

void [_badPath1, _badPath2, _badPath3, _badPath4];

// ============================================================================
// TypeAtPath tests
// ============================================================================

// Positive: Top-level types resolve correctly
expectType<string>({} as TypeAtPath<CouponSchema, "name">);
expectType<number>({} as TypeAtPath<CouponSchema, "percent_off">);
expectType<"forever" | "once" | "repeating">({} as TypeAtPath<CouponSchema, "duration">);
expectType<number | null>({} as TypeAtPath<CouponSchema, "duration_in_months">);

// Positive: Nested types resolve correctly
expectType<number>({} as TypeAtPath<CouponSchema, "max_discount.amount">);
expectType<string>({} as TypeAtPath<CouponSchema, "max_discount.currency">);
expectType<string[]>({} as TypeAtPath<CouponSchema, "applies_to.products">);

// Positive: Object types resolve correctly
expectType<{ amount: number; currency: string }>({} as TypeAtPath<CouponSchema, "max_discount">);

// Negative: Invalid path returns never
expectType<never>({} as TypeAtPath<CouponSchema, "invalid_path">);
expectType<never>({} as TypeAtPath<CouponSchema, "max_discount.invalid">);

// ============================================================================
// PathsToType tests - number paths
// ============================================================================

// Positive: Paths to number are included
expectAssignable<PathsToType<CouponSchema, number>>("percent_off");
expectAssignable<PathsToType<CouponSchema, number>>("max_discount.amount");

// Negative: Paths to non-number are excluded
// @ts-expect-error - name is string, not number
const _notNumber1: PathsToType<CouponSchema, number> = "name";
// @ts-expect-error - max_discount.currency is string, not number
const _notNumber2: PathsToType<CouponSchema, number> = "max_discount.currency";
// @ts-expect-error - duration is string union, not number
const _notNumber3: PathsToType<CouponSchema, number> = "duration";
// @ts-expect-error - duration_in_months is number | null, not number (strict match)
const _notNumber4: PathsToType<CouponSchema, number> = "duration_in_months";

void [_notNumber1, _notNumber2, _notNumber3, _notNumber4];

// ============================================================================
// PathsToType tests - string paths
// ============================================================================

// Positive: Paths to string are included
expectAssignable<PathsToType<CouponSchema, string>>("name");
expectAssignable<PathsToType<CouponSchema, string>>("max_discount.currency");

// Negative: Paths to non-string are excluded
// @ts-expect-error - percent_off is number, not string
const _notString1: PathsToType<CouponSchema, string> = "percent_off";
// @ts-expect-error - max_discount is object, not string
const _notString2: PathsToType<CouponSchema, string> = "max_discount";

void [_notString1, _notString2];

// NOTE: duration IS included in PathsToType<_, string> because
// "forever" | "once" | "repeating" extends string
expectAssignable<PathsToType<CouponSchema, string>>("duration");

// ============================================================================
// PathsToType tests - nullable types
// ============================================================================

// Positive: Paths to number | null
expectAssignable<PathsToType<CouponSchema, number | null>>("duration_in_months");
// Also includes plain number paths since number extends number | null
expectAssignable<PathsToType<CouponSchema, number | null>>("percent_off");
expectAssignable<PathsToType<CouponSchema, number | null>>("max_discount.amount");

// ============================================================================
// PathsToType tests - union literal types
// ============================================================================

// Positive: Paths to the exact union type
expectAssignable<PathsToType<CouponSchema, "forever" | "once" | "repeating">>("duration");

// ============================================================================
// PathsToType tests - array types
// ============================================================================

// Positive: Paths to string[] are included
expectAssignable<PathsToType<CouponSchema, string[]>>("applies_to.products");
expectAssignable<PathsToType<CouponSchema, string[]>>("applies_to.categories");
