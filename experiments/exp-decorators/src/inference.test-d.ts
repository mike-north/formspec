/**
 * Type-level tests for InferClassSchema utility type.
 *
 * These tests verify that the type inference works correctly
 * for various class structures.
 */

import { expectType, expectAssignable } from "tsd";
import type { InferClassSchema } from "./inference.js";

// =============================================================================
// BASIC TYPES
// =============================================================================

class SimpleForm {
  name!: string;
  age!: number;
  active!: boolean;
}

// Should infer basic types correctly
expectType<{
  name: string;
  age: number;
  active: boolean;
}>(null as unknown as InferClassSchema<SimpleForm>);

// =============================================================================
// OPTIONAL PROPERTIES
// =============================================================================

class OptionalForm {
  required!: string;
  optional?: number;
}

// Should preserve optionality
expectType<{
  required: string;
  optional?: number;
}>(null as unknown as InferClassSchema<OptionalForm>);

// =============================================================================
// ARRAY TYPES
// =============================================================================

class ArrayForm {
  tags!: string[];
  counts!: number[];
}

// Should infer array types
expectType<{
  tags: string[];
  counts: number[];
}>(null as unknown as InferClassSchema<ArrayForm>);

// =============================================================================
// NESTED OBJECTS
// =============================================================================

class Address {
  street!: string;
  city!: string;
  zip!: number;
}

class PersonWithAddress {
  name!: string;
  address!: Address;
}

// Should recursively infer nested object schemas
expectType<{
  name: string;
  address: {
    street: string;
    city: string;
    zip: number;
  };
}>(null as unknown as InferClassSchema<PersonWithAddress>);

// =============================================================================
// NESTED ARRAYS
// =============================================================================

class Item {
  id!: string;
  quantity!: number;
}

class Order {
  orderId!: string;
  items!: Item[];
}

// Should handle nested arrays
expectType<{
  orderId: string;
  items: {
    id: string;
    quantity: number;
  }[];
}>(null as unknown as InferClassSchema<Order>);

// =============================================================================
// METHODS EXCLUDED
// =============================================================================

class FormWithMethods {
  field!: string;

  // Methods should be excluded from schema
  validate(): boolean {
    return true;
  }

  submit(): void {
    // noop
  }
}

// Should exclude methods
expectType<{
  field: string;
}>(null as unknown as InferClassSchema<FormWithMethods>);

// =============================================================================
// COMPLEX NESTED STRUCTURE
// =============================================================================

class ContactInfo {
  email!: string;
  phone?: string;
}

class Education {
  institution!: string;
  degree!: string;
  year!: number;
}

class ComplexProfile {
  name!: string;
  age?: number;
  contact!: ContactInfo;
  education!: Education[];
  tags!: string[];
}

// Should handle complex nesting
expectType<{
  name: string;
  age?: number;
  contact: {
    email: string;
    phone?: string;
  };
  education: {
    institution: string;
    degree: string;
    year: number;
  }[];
  tags: string[];
}>(null as unknown as InferClassSchema<ComplexProfile>);

// =============================================================================
// ASSIGNABILITY TESTS
// =============================================================================

class AssignableForm {
  name!: string;
  count!: number;
}

// Schema should be assignable to correct types
expectAssignable<{ name: string; count: number }>(
  null as unknown as InferClassSchema<AssignableForm>
);

// Should work with additional properties in source
expectAssignable<{ name: string }>(null as unknown as InferClassSchema<AssignableForm>);
