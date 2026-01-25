/**
 * Component Type Patterns
 *
 * Tests how path types integrate with React component props.
 */

import type { PathsOf, TypeAtPath, PathsToType, CouponSchema } from "./path-types.js";

// ============================================================================
// Pattern 1: Generic form context with typed paths
// ============================================================================

/**
 * Form field component that only accepts valid paths
 */
type FieldProps<Schema, Path extends PathsOf<Schema>> = {
  path: Path;
  label?: string;
  onChange?: (value: TypeAtPath<Schema, Path>) => void;
};

// Test: Valid path compiles
function _testValidPath() {
  const props: FieldProps<CouponSchema, "name"> = {
    path: "name",
    onChange: (value) => {
      // value should be typed as string
      const _str: string = value;
      void _str;
    },
  };
  return props;
}
void _testValidPath;

// Test: Nested path compiles
function _testNestedPath() {
  const props: FieldProps<CouponSchema, "max_discount.amount"> = {
    path: "max_discount.amount",
    onChange: (value) => {
      // value should be typed as number
      const _num: number = value;
      void _num;
    },
  };
  return props;
}
void _testNestedPath;

// ============================================================================
// Pattern 2: Type-specific field components
// ============================================================================

/**
 * Number field that only accepts paths leading to number values
 */
type NumberFieldProps<Schema, Path extends PathsToType<Schema, number>> = {
  path: Path;
  min?: number;
  max?: number;
  step?: number;
};

// Test: Valid number path compiles
function _testNumberField() {
  const props: NumberFieldProps<CouponSchema, "percent_off"> = {
    path: "percent_off",
    min: 0,
    max: 100,
  };
  return props;
}
void _testNumberField;

// Test: Valid nested number path compiles
function _testNestedNumberField() {
  const props: NumberFieldProps<CouponSchema, "max_discount.amount"> = {
    path: "max_discount.amount",
    min: 0,
  };
  return props;
}
void _testNestedNumberField;

/**
 * Text field that only accepts paths leading to string values
 */
type TextFieldProps<Schema, Path extends PathsToType<Schema, string>> = {
  path: Path;
  placeholder?: string;
  maxLength?: number;
};

// Test: Valid string path compiles
function _testTextField() {
  const props: TextFieldProps<CouponSchema, "name"> = {
    path: "name",
    placeholder: "Enter coupon name",
    maxLength: 100,
  };
  return props;
}
void _testTextField;

// ============================================================================
// Pattern 3: Inferred path type from function call
// ============================================================================

/**
 * Helper to create a field config with inferred types
 */
function createField<Schema>() {
  return function <Path extends PathsOf<Schema>>(path: Path): FieldProps<Schema, Path> {
    return { path };
  };
}

// Test: Path inference works
function _testFieldFactory() {
  const field = createField<CouponSchema>();

  // These should all compile with correct type inference
  const nameField = field("name");
  const percentField = field("percent_off");
  const nestedField = field("max_discount.currency");

  void [nameField, percentField, nestedField];
}
void _testFieldFactory;

// ============================================================================
// Pattern 4: JSX-style component (requires @types/react)
// ============================================================================

// Uncomment if @types/react is available:
// import type { FC } from "react";
//
// type NumberFieldComponent<Schema> = FC<{
//   path: PathsToType<Schema, number>;
//   min?: number;
//   max?: number;
// }>;
//
// declare const NumberField: NumberFieldComponent<CouponSchema>;
//
// // Usage:
// const _jsx = <NumberField path="percent_off" min={0} max={100} />;

// ============================================================================
// Pattern 5: Form builder with chained field definitions
// ============================================================================

type FormBuilder<Schema> = {
  numberField<Path extends PathsToType<Schema, number>>(
    path: Path,
    config?: { min?: number; max?: number }
  ): FormBuilder<Schema>;

  textField<Path extends PathsToType<Schema, string>>(
    path: Path,
    config?: { placeholder?: string }
  ): FormBuilder<Schema>;

  build(): unknown;
};

// Simulated builder (implementation would be more complex)
function createFormBuilder<Schema>(): FormBuilder<Schema> {
  return {
    numberField() {
      return this;
    },
    textField() {
      return this;
    },
    build() {
      return {};
    },
  };
}

// Test: Builder with type-safe paths
function _testFormBuilder() {
  const form = createFormBuilder<CouponSchema>()
    .textField("name", { placeholder: "Coupon name" })
    .numberField("percent_off", { min: 0, max: 100 })
    .numberField("max_discount.amount")
    .textField("max_discount.currency")
    .build();

  return form;
}
void _testFormBuilder;
