/**
 * Chain DSL equivalent for feature composition testing.
 *
 * Tests combinations of labels, constraints, and array config that
 * can be expressed in the chain DSL surface.
 *
 * Note: Not all TSDoc features have Chain DSL equivalents.
 * Path-targeted constraints, @deprecated, @description, and
 * exclusiveMinimum/Maximum are TSDoc-only features.
 */
import { formspec, field } from "@formspec/dsl";

export const FeatureCompositionForm = formspec(
  /**
   * Text field with label + length constraints.
   * Parity with TSDoc: @displayName + @minLength + @maxLength.
   */
  field.text("name", {
    label: "Full Name",
    required: true,
    minLength: 1,
    maxLength: 200,
  }),

  /**
   * Number field with min + max + multipleOf combined.
   * Parity with TSDoc: @minimum + @maximum + @multipleOf.
   */
  field.number("preciseScore", {
    label: "Precise Score",
    required: true,
    min: 0,
    max: 100,
    multipleOf: 0.5,
  }),

  /**
   * Array field with minItems + maxItems combined.
   * Parity with TSDoc: @minItems + @maxItems.
   */
  field.arrayWithConfig(
    "tags",
    {
      label: "Tags",
      required: true,
      minItems: 1,
      maxItems: 5,
    },
    field.text("value", { label: "Tag" })
  )
);
