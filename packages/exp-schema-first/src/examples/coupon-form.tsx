/**
 * SCHEMA-FIRST EXAMPLE: Coupon Form
 *
 * This file represents what a user would actually write.
 * Notice: No utility types, no complex generics - just schema + JSX.
 */

import { z } from "zod";
import { createForm } from "../_internal/components.js";

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Define your schema (single source of truth)
// ─────────────────────────────────────────────────────────────────────────────

const CouponSchema = z.object({
  name: z.string().min(1).max(100),
  percent_off: z.number().min(0).max(100),
  duration: z.enum(["forever", "once", "repeating"]),
  active: z.boolean(),
  metadata: z.object({
    campaign: z.string(),
    source: z.string(),
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: Create typed components (one line!)
// ─────────────────────────────────────────────────────────────────────────────

const { Form, TextField, NumberField, SelectField, Checkbox, FieldGroup, SubmitButton } =
  createForm(CouponSchema);

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: Build your form with JSX
// ─────────────────────────────────────────────────────────────────────────────

export function CouponForm() {
  return (
    <Form onSubmit={(values) => console.log("Submitted:", values)}>
      <TextField
        path="name"
        label="Coupon Name"
        placeholder="e.g., SUMMER2024"
        maxLength={100}
      />

      <NumberField
        path="percent_off"
        label="Discount Percentage"
        min={0}
        max={100}
      />

      <SelectField
        path="duration"
        label="Duration"
        options={[
          { value: "forever", label: "Forever" },
          { value: "once", label: "Once" },
          { value: "repeating", label: "Repeating" },
        ] as const}
      />

      <Checkbox path="active" label="Active" />

      <FieldGroup path="metadata" label="Metadata">
        <TextField path="metadata.campaign" label="Campaign" />
        <TextField path="metadata.source" label="Source" />
      </FieldGroup>

      <SubmitButton>Create Coupon</SubmitButton>
    </Form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE SAFETY DEMO: These would all be compile errors
// ─────────────────────────────────────────────────────────────────────────────

// Uncomment to see type errors:

// ❌ Error: "invalid_path" doesn't exist in schema
// <TextField path="invalid_path" label="Oops" />

// ❌ Error: "percent_off" is a number, not a string
// <TextField path="percent_off" label="Wrong type" />

// ❌ Error: "name" is a string, not a number
// <NumberField path="name" label="Wrong type" />

// ❌ Error: "active" is a boolean, use Checkbox instead
// <TextField path="active" label="Wrong component" />
