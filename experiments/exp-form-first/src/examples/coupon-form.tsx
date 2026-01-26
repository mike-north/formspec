/**
 * FORM-FIRST EXAMPLE: Coupon Form
 *
 * This file represents what a user would actually write.
 * Notice: No schema definition needed - types are inferred from field definitions.
 */

import { defineForm, text, number, select, checkbox, group } from "../index.js";
import { AutoForm } from "../_internal/components.js";

// ─────────────────────────────────────────────────────────────────────────────
// APPROACH A: Define fields, auto-render form
// ─────────────────────────────────────────────────────────────────────────────

const couponForm = defineForm({
  name: text({
    label: "Coupon Name",
    placeholder: "e.g., SUMMER2024",
    maxLength: 100,
    required: true,
  }),

  percent_off: number({
    label: "Discount Percentage",
    min: 0,
    max: 100,
    required: true,
  }),

  duration: select(
    [
      { value: "forever", label: "Forever" },
      { value: "once", label: "Once" },
      { value: "repeating", label: "Repeating" },
    ],
    { label: "Duration" }
  ),

  duration_in_months: number({
    label: "Duration in Months",
    description: "Only applies when duration is 'repeating'",
  }),

  active: checkbox({
    label: "Active",
    defaultValue: true,
  }),

  metadata: group(
    {
      campaign: text({ label: "Campaign" }),
      source: text({ label: "Source" }),
    },
    { label: "Metadata" }
  ),
});

// Auto-generated form (zero JSX needed!)
export function CouponFormAuto() {
  return (
    <AutoForm
      definition={couponForm}
      onSubmit={(values) => {
        // values is fully typed!
        console.log("Name:", values.name);
        console.log("Percent off:", values.percent_off);
        console.log("Duration:", values.duration);
        console.log("Metadata:", values.metadata.campaign);
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROACH B: Define fields, custom JSX layout
// ─────────────────────────────────────────────────────────────────────────────

import { TextField, NumberField, SelectField, CheckboxField } from "../_internal/components.js";

export function CouponFormCustom() {
  const { Form, fields } = couponForm;

  return (
    <Form onSubmit={(values) => console.log("Submitted:", values)}>
      <div className="grid grid-cols-2 gap-4">
        <TextField name="name" {...fields.name} />
        <NumberField name="percent_off" {...fields.percent_off} />
      </div>

      <SelectField name="duration" {...fields.duration} />
      <NumberField name="duration_in_months" {...fields.duration_in_months} />
      <CheckboxField name="active" {...fields.active} />

      <fieldset>
        <legend>Metadata</legend>
        <TextField name="metadata.campaign" {...fields.metadata.fields.campaign} />
        <TextField name="metadata.source" {...fields.metadata.fields.source} />
      </fieldset>

      <button type="submit">Create Coupon</button>
    </Form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE SAFETY DEMO
// ─────────────────────────────────────────────────────────────────────────────

// The inferred type from the form definition:
type CouponValues = {
  name: string;
  percent_off: number;
  duration: "forever" | "once" | "repeating";
  duration_in_months: number;
  active: boolean;
  metadata: {
    campaign: string;
    source: string;
  };
};

// This type is automatically inferred - no manual definition needed!
function handleSubmit(values: typeof couponForm extends { Form: infer F } ? F : never) {
  // TypeScript knows the shape of values
  void values;
}
void handleSubmit;
