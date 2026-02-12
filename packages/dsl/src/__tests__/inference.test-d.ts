/**
 * Type-level tests for inference utilities.
 *
 * These tests verify that the type inference works correctly at compile time.
 * Run with: pnpm dlx tsd
 */

import { expectType, expectNotType } from "tsd";
import { field, group, when, is, formspec } from "../index.js";
import type { InferSchema, InferFormSchema, InferFieldValue } from "../index.js";
import type {
  TextField,
  NumberField,
  BooleanField,
  StaticEnumField,
  ArrayField,
  ObjectField,
} from "@formspec/core";

// =============================================================================
// InferFieldValue tests
// =============================================================================

// TextField should infer to string
expectType<string>({} as InferFieldValue<TextField<"name">>);

// NumberField should infer to number
expectType<number>({} as InferFieldValue<NumberField<"age">>);

// BooleanField should infer to boolean
expectType<boolean>({} as InferFieldValue<BooleanField<"active">>);

// StaticEnumField should infer to union of options
expectType<"draft" | "sent" | "paid">(
  {} as InferFieldValue<StaticEnumField<"status", readonly ["draft", "sent", "paid"]>>
);

// StaticEnumField with object options should infer to union of id values
expectType<"low" | "high">(
  {} as InferFieldValue<StaticEnumField<"priority", readonly [
    { readonly id: "low"; readonly label: "Low Priority" },
    { readonly id: "high"; readonly label: "High Priority" },
  ]>>
);

// ArrayField should infer to array of nested schema
type AddressItems = readonly [TextField<"street">, TextField<"city">];
expectType<{ street: string; city: string }[]>(
  {} as InferFieldValue<ArrayField<"addresses", AddressItems>>
);

// ObjectField should infer to nested schema
type AddressProps = readonly [TextField<"street">, TextField<"city">];
expectType<{ street: string; city: string }>(
  {} as InferFieldValue<ObjectField<"address", AddressProps>>
);

// =============================================================================
// InferSchema tests - Basic fields
// =============================================================================

// Test single text field
const _singleTextField = formspec(
  field.text("name"),
);
type SingleTextSchema = InferSchema<typeof _singleTextField.elements>;
expectType<{ name: string }>({} as SingleTextSchema);

// Test multiple basic fields
const _multipleFields = formspec(
  field.text("name"),
  field.number("age"),
  field.boolean("active"),
);
type MultipleFieldsSchema = InferSchema<typeof _multipleFields.elements>;
expectType<{ name: string; age: number; active: boolean }>({} as MultipleFieldsSchema);

// =============================================================================
// InferSchema tests - Enum fields
// =============================================================================

// Test static enum field
const _enumForm = formspec(
  field.enum("status", ["draft", "sent", "paid"] as const),
);
type EnumSchema = InferSchema<typeof _enumForm.elements>;
expectType<{ status: "draft" | "sent" | "paid" }>({} as EnumSchema);

// Test static enum field with object options
const _objectEnumForm = formspec(
  field.enum("priority", [
    { id: "low", label: "Low Priority" },
    { id: "high", label: "High Priority" },
  ] as const),
);
type ObjectEnumSchema = InferSchema<typeof _objectEnumForm.elements>;
expectType<{ priority: "low" | "high" }>({} as ObjectEnumSchema);

// =============================================================================
// InferSchema tests - Groups
// =============================================================================

// Test fields inside groups
const _groupForm = formspec(
  group("Customer",
    field.text("name"),
    field.text("email"),
  ),
  field.number("amount"),
);
type GroupSchema = InferSchema<typeof _groupForm.elements>;
expectType<{ name: string; email: string; amount: number }>({} as GroupSchema);

// =============================================================================
// InferSchema tests - Conditionals
// =============================================================================

// Test fields inside conditionals - should be optional
const _conditionalForm = formspec(
  field.enum("type", ["personal", "business"] as const),
  when(is("type", "business"),
    field.text("company"),
  ),
);
type ConditionalSchema = InferSchema<typeof _conditionalForm.elements>;
// company is optional since it's inside a conditional
expectType<{ type: "personal" | "business"; company?: string }>({} as ConditionalSchema);

// Test multiple conditionals - all conditional fields should be optional
const _multiConditionalForm = formspec(
  field.enum("accountType", ["personal", "business"] as const),
  when(is("accountType", "personal"),
    field.text("ssn"),
  ),
  when(is("accountType", "business"),
    field.text("ein"),
    field.text("companyName"),
  ),
);
type MultiConditionalSchema = InferSchema<typeof _multiConditionalForm.elements>;
expectType<{
  accountType: "personal" | "business";
  ssn?: string;
  ein?: string;
  companyName?: string;
}>({} as MultiConditionalSchema);

// Test conditional inside group - still optional
const _conditionalInGroupForm = formspec(
  group("Details",
    field.text("name"),
    when(is("showExtra", true),
      field.text("extra"),
    ),
  ),
  field.boolean("showExtra"),
);
type ConditionalInGroupSchema = InferSchema<typeof _conditionalInGroupForm.elements>;
expectType<{ name: string; showExtra: boolean; extra?: string }>({} as ConditionalInGroupSchema);

// Test group inside conditional - all fields optional
const _groupInConditionalForm = formspec(
  field.boolean("showAddress"),
  when(is("showAddress", true),
    group("Address",
      field.text("street"),
      field.text("city"),
    ),
  ),
);
type GroupInConditionalSchema = InferSchema<typeof _groupInConditionalForm.elements>;
expectType<{ showAddress: boolean; street?: string; city?: string }>({} as GroupInConditionalSchema);

// =============================================================================
// InferSchema tests - Array fields
// =============================================================================

// Test array fields
const _arrayForm = formspec(
  field.array("addresses",
    field.text("street"),
    field.text("city"),
  ),
);
type ArraySchema = InferSchema<typeof _arrayForm.elements>;
expectType<{ addresses: { street: string; city: string }[] }>({} as ArraySchema);

// =============================================================================
// InferSchema tests - Object fields
// =============================================================================

// Test object fields
const _objectForm = formspec(
  field.object("address",
    field.text("street"),
    field.text("city"),
    field.text("zip"),
  ),
);
type ObjectSchema = InferSchema<typeof _objectForm.elements>;
expectType<{ address: { street: string; city: string; zip: string } }>({} as ObjectSchema);

// =============================================================================
// InferFormSchema tests
// =============================================================================

// Test InferFormSchema convenience type
const _complexForm = formspec(
  field.text("name"),
  field.number("amount"),
  field.enum("status", ["active", "inactive"] as const),
);
type ComplexSchema = InferFormSchema<typeof _complexForm>;
expectType<{ name: string; amount: number; status: "active" | "inactive" }>(
  {} as ComplexSchema
);

// =============================================================================
// Negative tests - types should NOT match
// =============================================================================

// TextField should NOT infer to number
expectNotType<number>({} as InferFieldValue<TextField<"name">>);

// NumberField should NOT infer to string
expectNotType<string>({} as InferFieldValue<NumberField<"age">>);

// Enum should NOT allow invalid values
expectNotType<{ status: string }>({} as InferSchema<typeof _enumForm.elements>);
