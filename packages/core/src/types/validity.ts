/**
 * Represents the validity state of a field or form.
 *
 * - `"valid"` - All validations pass
 * - `"invalid"` - One or more validations failed
 * - `"unknown"` - Validation state not yet determined (e.g., async validation pending)
 */
export type Validity = "valid" | "invalid" | "unknown";
