/**
 * Core types from the formspec spec (Section 6 & 7)
 */

// Validity state for a field
export type Validity = "valid" | "invalid" | "unknown";

// State of a single field
export type FieldState<T> = {
  value: T | null;
  validity: Validity;
};

// Complete form state
export type FormState<Schema extends Record<string, unknown>> = {
  validity: Validity;
  fields: {
    [K in keyof Schema]: FieldState<Schema[K]>;
  };
};

// Option item for dynamic options
export type OptionItem = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

// Response from fetchOptions
export type FetchOptionsResponse =
  | { validity: "valid"; options?: OptionItem[]; schema?: unknown; value?: unknown }
  | {
      validity: "invalid";
      message?: string;
      options?: OptionItem[];
      schema?: unknown;
      value?: unknown;
    }
  | {
      validity: "unknown";
      message?: string;
      options?: OptionItem[];
      schema?: unknown;
      value?: unknown;
    };

/**
 * Example FieldParameterMap from the spec (Section 7.3)
 *
 * This maps field IDs to their parameter types for fetchOptions calls.
 */
export type FieldParameterMap = {
  template_id: { fragment?: string };
  template_vars: Record<string, never>;
  crm_object: { fragment?: string };
  field_mapping: Record<string, never>;
};

/**
 * Combined request object for Reverse API (Section 14.1)
 *
 * DECISION: Use two type parameters for narrowing support.
 * When checking `request.field === "template_id"`, K narrows and
 * the constraint `Params extends FieldParameterMap[K]` follows.
 */
export type FetchOptionsRequest<
  K extends keyof FieldParameterMap,
  Params extends FieldParameterMap[K],
> = {
  field: K;
  form_state: FormState<Record<string, unknown>>;
  parameters: Params;
};

/**
 * Discriminated union version - useful for exhaustive switch handling.
 * Auto-generated from FieldParameterMap.
 */
export type FetchOptionsRequestUnion = {
  [F in keyof FieldParameterMap]: {
    field: F;
    form_state: FormState<Record<string, unknown>>;
    parameters: FieldParameterMap[F];
  };
}[keyof FieldParameterMap];
