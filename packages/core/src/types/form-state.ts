import type { FieldState } from "./field-state.js";
import type { Validity } from "./validity.js";

/**
 * Represents the runtime state of an entire form.
 *
 * @typeParam Schema - The form schema type (maps field names to value types)
 */
export interface FormState<Schema extends Record<string, unknown>> {
  /** State for each field, keyed by field name */
  readonly fields: {
    readonly [K in keyof Schema]: FieldState<Schema[K]>;
  };

  /** Whether any field has been modified */
  readonly dirty: boolean;

  /** Whether the form is currently being submitted */
  readonly submitting: boolean;

  /** Overall form validity (derived from all field validities) */
  readonly validity: Validity;
}
