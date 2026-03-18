/**
 * Type-level tests for @formspec/decorators.
 *
 * These tests verify that decorator signatures, brands, and factory functions
 * work correctly at compile time.
 *
 * Run with: pnpm dlx tsd
 */

import { expectType, expectError, expectAssignable, expectNotAssignable } from "tsd";
import {
  Field,
  Group,
  ShowWhen,
  EnumOptions,
  Minimum,
  Maximum,
  ExclusiveMinimum,
  ExclusiveMaximum,
  MinLength,
  MaxLength,
  Pattern,
  extendDecorator,
  customDecorator,
  type FormSpecDecorators,
  type FormSpecExtendsBrand,
  type FormSpecExtensionBrand,
  type FormSpecMarkerBrand,
  type FieldOptions,
  type ShowWhenCondition,
  type EnumOptionsInput,
  FORMSPEC_EXTENDS,
  FORMSPEC_EXTENSION,
  FORMSPEC_MARKER,
} from "../index.js";

// =============================================================================
// Built-in decorator type signatures
// =============================================================================

// Field returns a ClassFieldDecorator when given FieldOptions
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(
  Field({ displayName: "test" })
);

// Field requires displayName
expectError(Field({}));

// Field accepts optional properties
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(
  Field({
    displayName: "Name",
    description: "User's full name",
    placeholder: "Jane Doe",
    order: 1,
  })
);

// Group returns a ClassFieldDecorator
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(Group("Personal Info"));

// Group requires a string
expectError(Group(123));

// ShowWhen returns a ClassFieldDecorator
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(
  ShowWhen({ field: "status", value: "active" })
);

// ShowWhen requires both field and value
expectError(ShowWhen({ field: "status" }));
expectError(ShowWhen({ value: "active" }));

// EnumOptions returns a ClassFieldDecorator with array input
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(
  EnumOptions(["us", "ca", "uk"])
);

// EnumOptions accepts object options
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(
  EnumOptions([
    { id: "us", label: "United States" },
    { id: "ca", label: "Canada" },
  ])
);

// EnumOptions accepts record input
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(
  EnumOptions({ us: "United States", ca: "Canada" })
);

// Minimum returns a ClassFieldDecorator
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(Minimum(5));

// Minimum requires a number
expectError(Minimum("5"));

// Maximum returns a ClassFieldDecorator
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(Maximum(100));

// Maximum requires a number
expectError(Maximum("100"));

// ExclusiveMinimum returns a ClassFieldDecorator
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(ExclusiveMinimum(0));

// ExclusiveMaximum returns a ClassFieldDecorator
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(ExclusiveMaximum(100));

// MinLength returns a ClassFieldDecorator
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(MinLength(3));

// MinLength requires a number
expectError(MinLength("3"));

// MaxLength returns a ClassFieldDecorator
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(MaxLength(255));

// MaxLength requires a number
expectError(MaxLength("255"));

// Pattern returns a ClassFieldDecorator
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(Pattern("^[a-z]+$"));

// Pattern takes string, not RegExp
expectError(Pattern(/^[a-z]+$/));

// =============================================================================
// extendDecorator constraints and return types
// =============================================================================

// extendDecorator only accepts keyof FormSpecDecorators
const _validExtend = extendDecorator("Field");
const _validExtend2 = extendDecorator("Minimum");
const _validExtend3 = extendDecorator("Pattern");

// extendDecorator rejects invalid decorator names
expectError(extendDecorator("InvalidName"));
expectError(extendDecorator("CustomThing"));

// extendDecorator().as() returns a branded factory function
const CurrencyField = extendDecorator("Field").as<{
  displayName: string;
  currency: string;
}>("CurrencyField");

// The factory should return a ClassFieldDecorator
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(
  CurrencyField({ displayName: "Amount", currency: "USD" })
);

// The factory should be branded with FormSpecExtendsBrand<"Field">
expectAssignable<FormSpecExtendsBrand<"Field">>(CurrencyField);

// Verify the brand symbol is present at the type level
expectType<"Field">(CurrencyField[FORMSPEC_EXTENDS]);

// extendDecorator preserves the extends relationship in the type
const MinimumExt = extendDecorator("Minimum").as<{ min: number; reason?: string }>("MinimumExt");
expectAssignable<FormSpecExtendsBrand<"Minimum">>(MinimumExt);
expectType<"Minimum">(MinimumExt[FORMSPEC_EXTENDS]);

// Different extends brands should not be assignable to each other
const FieldExt = extendDecorator("Field").as<{ displayName: string }>("FieldExt");
const GroupExt = extendDecorator("Group").as<{ name: string }>("GroupExt");

// FieldExt should not be assignable to FormSpecExtendsBrand<"Group">
expectNotAssignable<FormSpecExtendsBrand<"Group">>(FieldExt);
// GroupExt should not be assignable to FormSpecExtendsBrand<"Field">
expectNotAssignable<FormSpecExtendsBrand<"Field">>(GroupExt);

// =============================================================================
// customDecorator overloads
// =============================================================================

// customDecorator with extension name - .as() variant
const TooltipWithExt = customDecorator("my-ui-extension").as<{ text: string }>("Tooltip");

// Should return a factory that produces a ClassFieldDecorator
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(
  TooltipWithExt({ text: "Hover text" })
);

// Should have FormSpecExtensionBrand
expectAssignable<FormSpecExtensionBrand<"my-ui-extension">>(TooltipWithExt);
expectType<"my-ui-extension">(TooltipWithExt[FORMSPEC_EXTENSION]);

// customDecorator with extension name - .marker() variant
const SensitiveWithExt = customDecorator("my-ui-extension").marker("Sensitive");

// Should be assignable to ClassFieldDecorator (applied directly, no call needed)
expectAssignable<(value: undefined, context: ClassFieldDecoratorContext) => void>(SensitiveWithExt);

// Should have both FormSpecMarkerBrand and FormSpecExtensionBrand
expectAssignable<FormSpecMarkerBrand>(SensitiveWithExt);
expectAssignable<FormSpecExtensionBrand<"my-ui-extension">>(SensitiveWithExt);
expectType<true>(SensitiveWithExt[FORMSPEC_MARKER]);
expectType<"my-ui-extension">(SensitiveWithExt[FORMSPEC_EXTENSION]);

// customDecorator without extension name - .as() variant
const TooltipNoExt = customDecorator().as<{ text: string }>("TooltipNoExt");

// Should return a factory that produces a ClassFieldDecorator
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(
  TooltipNoExt({ text: "Hover text" })
);

// Should NOT have FormSpecExtensionBrand when no extension name provided
// This is tricky - the overload without extension name returns a plain factory
// We can test that it doesn't have the extension property by checking assignability
type TooltipNoExtType = typeof TooltipNoExt;
type HasExtensionBrand = TooltipNoExtType extends FormSpecExtensionBrand<string> ? true : false;
expectType<false>(null as unknown as HasExtensionBrand);

// customDecorator without extension name - .marker() variant
const TitleNoExt = customDecorator().marker("Title");

// Should be assignable to ClassFieldDecorator
expectAssignable<(value: undefined, context: ClassFieldDecoratorContext) => void>(TitleNoExt);

// Should have FormSpecMarkerBrand
expectAssignable<FormSpecMarkerBrand>(TitleNoExt);
expectType<true>(TitleNoExt[FORMSPEC_MARKER]);

// Should NOT have FormSpecExtensionBrand
type TitleNoExtType = typeof TitleNoExt;
type TitleHasExtensionBrand = TitleNoExtType extends FormSpecExtensionBrand<string> ? true : false;
expectType<false>(null as unknown as TitleHasExtensionBrand);

// =============================================================================
// FormSpecDecorators registry
// =============================================================================

// Verify all expected keys exist in FormSpecDecorators
expectType<FieldOptions>(null as unknown as FormSpecDecorators["Field"]);
expectType<string>(null as unknown as FormSpecDecorators["Group"]);
expectType<ShowWhenCondition>(null as unknown as FormSpecDecorators["ShowWhen"]);
expectType<EnumOptionsInput>(null as unknown as FormSpecDecorators["EnumOptions"]);
expectType<number>(null as unknown as FormSpecDecorators["Minimum"]);
expectType<number>(null as unknown as FormSpecDecorators["Maximum"]);
expectType<number>(null as unknown as FormSpecDecorators["ExclusiveMinimum"]);
expectType<number>(null as unknown as FormSpecDecorators["ExclusiveMaximum"]);
expectType<number>(null as unknown as FormSpecDecorators["MinLength"]);
expectType<number>(null as unknown as FormSpecDecorators["MaxLength"]);
expectType<string>(null as unknown as FormSpecDecorators["Pattern"]);

// =============================================================================
// Type exports - verify they're accessible
// =============================================================================

// Verify exported types are usable
const _fieldOpts: FieldOptions = { displayName: "Test" };
const _showWhenCond: ShowWhenCondition = { field: "status", value: "active" };
const _enumArray: EnumOptionsInput = ["a", "b", "c"];
const _enumRecord: EnumOptionsInput = { a: "A", b: "B" };
const _enumObjects: EnumOptionsInput = [
  { id: "a", label: "A" },
  { id: "b", label: "B" },
];

// =============================================================================
// Brand symbols - verify they're accessible
// =============================================================================

// Verify brand symbols are exported and unique
expectType<typeof FORMSPEC_EXTENDS>(FORMSPEC_EXTENDS);
expectType<typeof FORMSPEC_EXTENSION>(FORMSPEC_EXTENSION);
expectType<typeof FORMSPEC_MARKER>(FORMSPEC_MARKER);

// =============================================================================
// Complex usage patterns
// =============================================================================

// Multiple extends with different base decorators
const RangeField = extendDecorator("Field").as<{
  displayName: string;
  min: number;
  max: number;
}>("RangeField");

expectType<"Field">(RangeField[FORMSPEC_EXTENDS]);
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(
  RangeField({ displayName: "Age", min: 0, max: 120 })
);

// Custom decorator with complex type
interface TooltipConfig {
  text: string;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
}

const RichTooltip = customDecorator("tooltips").as<TooltipConfig>("RichTooltip");
expectType<"tooltips">(RichTooltip[FORMSPEC_EXTENSION]);
expectType<(value: undefined, context: ClassFieldDecoratorContext) => void>(
  RichTooltip({ text: "Help text", position: "top", delay: 300 })
);

// Marker decorator should not require arguments
const Required = customDecorator("validation").marker("Required");
expectType<true>(Required[FORMSPEC_MARKER]);
expectType<"validation">(Required[FORMSPEC_EXTENSION]);

// =============================================================================
// Negative tests - things that should NOT compile
// =============================================================================

// Cannot extend non-existent decorator
expectError(extendDecorator("NonExistent"));

// Cannot pass wrong argument type to built-in decorators
expectError(Field("not an object"));
expectError(Minimum("not a number"));
expectError(Pattern(/not-a-string/));
expectError(MaxLength(true));

// Cannot omit required properties
expectError(Field({ description: "Missing displayName" }));
expectError(ShowWhen({ field: "status" })); // missing value

// extendDecorator result must be called to get decorator
const PartialCurrency = extendDecorator("Field").as<{ currency: string }>("PartialCurrency");
expectError<(value: undefined, context: ClassFieldDecoratorContext) => void>(PartialCurrency);

// customDecorator().as() result must be called to get decorator
const PartialTooltip = customDecorator().as<{ text: string }>("PartialTooltip");
expectError<(value: undefined, context: ClassFieldDecoratorContext) => void>(PartialTooltip);
