import type { Validity } from "./validity.js";

/**
 * Represents the runtime state of a single form field.
 *
 * @typeParam T - The value type of the field
 */
export interface FieldState<T> {
  /** Current value of the field */
  readonly value: T;

  /** Whether the field has been modified by the user */
  readonly dirty: boolean;

  /** Whether the field has been focused and blurred */
  readonly touched: boolean;

  /** Current validity state */
  readonly validity: Validity;

  /** Validation error messages, if any */
  readonly errors: readonly string[];
}

/**
 * Creates initial field state with default values.
 *
 * @typeParam T - The value type of the field
 * @param value - The initial value for the field
 * @returns Initial field state
 */
export function createInitialFieldState<T>(value: T): FieldState<T> {
  return {
    value,
    dirty: false,
    touched: false,
    validity: "unknown",
    errors: [],
  };
}
