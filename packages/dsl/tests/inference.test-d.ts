/**
 * Type-level tests for inference utilities.
 *
 * These tests verify that the type inference works correctly at compile time.
 * Run with: pnpm dlx tsd
 */

import { expectType, expectNotType, expectError } from "tsd";
import { field, group, when, is, formspec } from "../src/index.js";
import type { InferSchema, InferFormSchema, InferFieldValue } from "../src/index.js";
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
  {} as InferFieldValue<
    StaticEnumField<
      "priority",
      readonly [
        { readonly id: "low"; readonly label: "Low Priority" },
        { readonly id: "high"; readonly label: "High Priority" },
      ]
    >
  >
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
const _singleTextField = formspec(field.text("name"));
type SingleTextSchema = InferSchema<typeof _singleTextField.elements>;
expectType<{ name: string }>({} as SingleTextSchema);

// Test multiple basic fields
const _multipleFields = formspec(field.text("name"), field.number("age"), field.boolean("active"));
type MultipleFieldsSchema = InferSchema<typeof _multipleFields.elements>;
expectType<{ name: string; age: number; active: boolean }>({} as MultipleFieldsSchema);

// =============================================================================
// InferSchema tests - Enum fields
// =============================================================================

// Test static enum field
const _enumForm = formspec(field.enum("status", ["draft", "sent", "paid"] as const));
type EnumSchema = InferSchema<typeof _enumForm.elements>;
expectType<{ status: "draft" | "sent" | "paid" }>({} as EnumSchema);

// Test static enum field with object options
const _objectEnumForm = formspec(
  field.enum("priority", [
    { id: "low", label: "Low Priority" },
    { id: "high", label: "High Priority" },
  ] as const)
);
type ObjectEnumSchema = InferSchema<typeof _objectEnumForm.elements>;
expectType<{ priority: "low" | "high" }>({} as ObjectEnumSchema);

// =============================================================================
// InferSchema tests - Groups
// =============================================================================

// Test fields inside groups
const _groupForm = formspec(
  group("Customer", field.text("name"), field.text("email")),
  field.number("amount")
);
type GroupSchema = InferSchema<typeof _groupForm.elements>;
expectType<{ name: string; email: string; amount: number }>({} as GroupSchema);

// =============================================================================
// InferSchema tests - Conditionals
// =============================================================================

// Test fields inside conditionals - should be optional
const _conditionalForm = formspec(
  field.enum("type", ["personal", "business"] as const),
  when(is("type", "business"), field.text("company"))
);
type ConditionalSchema = InferSchema<typeof _conditionalForm.elements>;
// company is optional since it's inside a conditional
expectType<{ type: "personal" | "business"; company?: string }>({} as ConditionalSchema);

// Test multiple conditionals - all conditional fields should be optional
const _multiConditionalForm = formspec(
  field.enum("accountType", ["personal", "business"] as const),
  when(is("accountType", "personal"), field.text("ssn")),
  when(is("accountType", "business"), field.text("ein"), field.text("companyName"))
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
  group("Details", field.text("name"), when(is("showExtra", true), field.text("extra"))),
  field.boolean("showExtra")
);
type ConditionalInGroupSchema = InferSchema<typeof _conditionalInGroupForm.elements>;
expectType<{ name: string; showExtra: boolean; extra?: string }>({} as ConditionalInGroupSchema);

// Test group inside conditional - all fields optional
const _groupInConditionalForm = formspec(
  field.boolean("showAddress"),
  when(is("showAddress", true), group("Address", field.text("street"), field.text("city")))
);
type GroupInConditionalSchema = InferSchema<typeof _groupInConditionalForm.elements>;
expectType<{ showAddress: boolean; street?: string; city?: string }>(
  {} as GroupInConditionalSchema
);

// Regression: #512 — a `required: true` field inside a top-level conditional is
// OPTIONAL in the inferred type (`Partial<…>`), and the JSON Schema generator
// must keep it out of the root `required` array to agree. This pins the type
// side of the round-trip: `aField?` here ⟺ `"aField"` absent from schema
// `required` (asserted at runtime in @formspec/build's integration test).
const _conditionalRequiredForm = formspec(
  field.enum("type", ["a", "b"] as const, { required: true }),
  when(is("type", "a"), field.text("aField", { required: true }))
);
type ConditionalRequiredSchema = InferSchema<typeof _conditionalRequiredForm.elements>;
expectType<{ type: "a" | "b"; aField?: string }>({} as ConditionalRequiredSchema);

// =============================================================================
// InferSchema tests - `required: false` on non-conditional fields (#512)
// =============================================================================
//
// Decision (issue #512, acceptance criterion 4): `required` affects only JSON
// Schema validation. Inferred-type optionality is driven by conditional
// membership, NOT by the `required` flag. A non-conditional field with
// `{ required: false }` therefore stays PRESENT (non-optional) in the inferred
// type, even though it is omitted from the schema's `required` array. We pin the
// current behavior here rather than changing `InferSchema` semantics, which
// would be a wider behavior change (see the `InferSchema` doc comment).
const _explicitOptionalForm = formspec(
  field.text("name", { required: true }),
  field.text("nickname", { required: false })
);
type ExplicitOptionalSchema = InferSchema<typeof _explicitOptionalForm.elements>;
// `nickname` is NOT optional in the inferred type despite `required: false`.
expectType<{ name: string; nickname: string }>({} as ExplicitOptionalSchema);
// Guard the pin: the key must not become optional.
expectNotType<{ name: string; nickname?: string }>({} as ExplicitOptionalSchema);

// =============================================================================
// InferSchema tests - Array fields
// =============================================================================

// Test array fields
const _arrayForm = formspec(field.array("addresses", field.text("street"), field.text("city")));
type ArraySchema = InferSchema<typeof _arrayForm.elements>;
expectType<{ addresses: { street: string; city: string }[] }>({} as ArraySchema);

// =============================================================================
// InferSchema tests - Object fields
// =============================================================================

// Test object fields
const _objectForm = formspec(
  field.object("address", field.text("street"), field.text("city"), field.text("zip"))
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
  field.enum("status", ["active", "inactive"] as const)
);
type ComplexSchema = InferFormSchema<typeof _complexForm>;
expectType<{ name: string; amount: number; status: "active" | "inactive" }>({} as ComplexSchema);

// =============================================================================
// Negative tests - types should NOT match
// =============================================================================

// TextField should NOT infer to number
expectNotType<number>({} as InferFieldValue<TextField<"name">>);

// NumberField should NOT infer to string
expectNotType<string>({} as InferFieldValue<NumberField<"age">>);

// Enum should NOT allow invalid values
expectNotType<{ status: string }>({} as InferSchema<typeof _enumForm.elements>);

// =============================================================================
// Negative tests - invalid field.* option objects (#556)
// =============================================================================

// text() config does not accept number-field-only options like `min`/`max`
expectError(field.text("name", { min: 5 }));

// number() config does not accept text-field-only options like `pattern`/`minLength`
expectError(field.number("age", { pattern: "^\\d+$" }));
expectError(field.number("age", { minLength: 1 }));

// boolean() config does not accept unknown options
expectError(field.boolean("active", { options: ["yes", "no"] }));

// enum() requires an options array as the second argument
expectError(field.enum("status"));

// =============================================================================
// Negative tests - malformed formspec(...) inputs (#556)
// =============================================================================

// formspec() only accepts FormElement values, not arbitrary strings/objects
expectError(formspec("not-a-field"));
expectError(formspec({ name: "name" }));

// A field-shaped object missing the `_type`/`_field` discriminators is rejected
expectError(formspec({ name: "name", label: "Name" } as const));

// =============================================================================
// Negative tests - InferFormSchema<> over non-form types (#556)
// =============================================================================

// InferFormSchema requires a FormSpec<readonly FormElement[]>; a bare string,
// number, or plain object does not satisfy that constraint.
// @ts-expect-error - string does not extend FormSpec<readonly FormElement[]>
type _InvalidFormSchemaFromString = InferFormSchema<string>;
// @ts-expect-error - a plain object does not extend FormSpec<readonly FormElement[]>
type _InvalidFormSchemaFromObject = InferFormSchema<{ elements: string[] }>;

// =============================================================================
// Edge case - empty forms
// =============================================================================

// A form with no elements infers a schema with no keys at all (not `never` or
// `unknown` on the schema type itself).
const _emptyForm = formspec();
type EmptyFormSchema = InferFormSchema<typeof _emptyForm>;
expectType<never>({} as keyof EmptyFormSchema);

// =============================================================================
// Edge case - union option types
// =============================================================================

// A single-option enum's inferred value stays the literal, not `string`.
const _singleOptionEnumForm = formspec(field.enum("mode", ["only"] as const));
type SingleOptionEnumSchema = InferSchema<typeof _singleOptionEnumForm.elements>;
expectType<{ mode: "only" }>({} as SingleOptionEnumSchema);
expectNotType<{ mode: string }>({} as SingleOptionEnumSchema);

// A single {id, label} enum option's inferred value stays the id literal.
const _singleObjectOptionEnumForm = formspec(
  field.enum("mode", [{ id: "only", label: "Only" }] as const)
);
type SingleObjectOptionEnumSchema = InferSchema<typeof _singleObjectOptionEnumForm.elements>;
expectType<{ mode: "only" }>({} as SingleObjectOptionEnumSchema);

// Note (#556): `field.enum()` options are typed as `EnumOptionValue` (`string |
// {id, label}`), which permits constructing a *mixed* tuple at the type level —
// e.g. `["low", { id: "high", label: "High Priority" }] as const`. The runtime
// builder rejects mixed tuples with a thrown Error (see field.ts), but nothing
// at the type level currently prevents authoring one, and `InferFieldValue`
// resolves a mixed tuple to `never` rather than a compile error. This is a
// static/runtime semantics gap, not covered here because it cannot be pinned
// with a passing type-level assertion; tracked for follow-up rather than fixed
// in this change (see PR description).
