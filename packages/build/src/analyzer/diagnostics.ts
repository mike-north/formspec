/**
 * Shared analyzer diagnostic codes and default messages.
 *
 * Keeping analyzer-owned codes in one module gives analyzer tests and
 * diagnostic emitters a single source of truth without widening the package
 * entry-point surface.
 */

export const ANONYMOUS_RECURSIVE_TYPE_DIAGNOSTIC_CODE = "ANONYMOUS_RECURSIVE_TYPE" as const;

export const ANONYMOUS_RECURSIVE_TYPE_DIAGNOSTIC_MESSAGE =
  "Anonymous recursive type detected. Extract this type to a named class, interface, or type alias to enable recursive $ref emission.";
