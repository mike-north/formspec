/**
 * Parity fixture — usd-cents — chain DSL definition.
 *
 * Mirrors the effective numeric semantics of the TSDoc alias chain:
 * - integer-valued number fields via `multipleOf: 1`
 * - inherited minimum bounds resolved into the final field constraints
 */

import { formspec, field } from "@formspec/dsl";

export const usdCentsForm = formspec(
  field.number("unitPrice", {
    required: true,
    min: 0,
    multipleOf: 1,
  }),
  field.number("quantity", {
    required: true,
    min: 1,
    multipleOf: 1,
  })
);
