/**
 * Parity fixture — plan-status — chain DSL definition.
 *
 * Covers the shared static enum surface:
 * - field-level display name
 * - labeled enum members via object options
 * - required enum field
 */

import { formspec, field } from "@formspec/dsl";

export const planStatusForm = formspec(
  field.enum(
    "status",
    [
      { id: "active", label: "Active" },
      { id: "paused", label: "Paused" },
      { id: "cancelled", label: "Cancelled" },
    ] as const,
    {
      label: "Plan Status",
      required: true,
    }
  )
);
