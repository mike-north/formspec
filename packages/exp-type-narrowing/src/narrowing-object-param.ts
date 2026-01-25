/**
 * Experiment: Does TypeScript narrow request.parameters based on request.field?
 *
 * This tests the Reverse API pattern from Section 14.1:
 *   fetchOptions({ field, form_state, parameters })
 */

import type {
  FieldParameterMap,
  FormState,
  FetchOptionsResponse,
  FetchOptionsRequest,
  FetchOptionsRequestUnion,
} from "./types.js";

/**
 * APPROACH 1: Single type param (DEPRECATED - doesn't narrow well)
 *
 * This approach is kept for historical reference.
 * Use the two-type-param pattern instead.
 */
// Skipped - see fetchOptionsObjectTwoParams below

/**
 * APPROACH 1b: Two type parameters with object
 *
 * Does the two-type-param trick work when params are in an object?
 */
type FetchOptionsRequestTwoParams<
  K extends keyof FieldParameterMap,
  Params extends FieldParameterMap[K],
> = {
  field: K;
  form_state: FormState<Record<string, unknown>>;
  parameters: Params;
};

export function fetchOptionsObjectTwoParams<
  K extends keyof FieldParameterMap,
  Params extends FieldParameterMap[K],
>(request: FetchOptionsRequestTwoParams<K, Params>): FetchOptionsResponse {
  if (request.field === "template_id") {
    // Test: Is K narrowed?
    const _kValue: "template_id" = request.field;
    void _kValue;

    // Test: Can we access .fragment on parameters?
    const fragment = request.parameters.fragment;
    console.log("Fragment:", fragment);

    return { validity: "valid" };
  }

  if (request.field === "template_vars") {
    // K should be narrowed to "template_vars"
    const _kValue: "template_vars" = request.field;
    void _kValue;

    return { validity: "valid" };
  }

  return { validity: "unknown" };
}

// Call-site test for object pattern
export function testObjectCallSite() {
  // Good: correct pairing
  fetchOptionsObjectTwoParams({
    field: "template_id",
    form_state: {} as FormState<Record<string, unknown>>,
    parameters: { fragment: "search" },
  });

  // Good: template_vars with empty params
  fetchOptionsObjectTwoParams({
    field: "template_vars",
    form_state: {} as FormState<Record<string, unknown>>,
    parameters: {},
  });

  // Should error: wrong params for field
  fetchOptionsObjectTwoParams({
    field: "template_vars",
    form_state: {} as FormState<Record<string, unknown>>,
    parameters: {
      // @ts-expect-error - fragment not allowed for template_vars
      fragment: "search",
    },
  });
}

/**
 * APPROACH 2: Discriminated union
 *
 * This DOES work! TypeScript narrows the entire union based on the discriminant.
 */
export function fetchOptionsUnion(
  request: FetchOptionsRequestUnion
): FetchOptionsResponse {
  // This works! TS narrows the entire request based on field
  if (request.field === "template_id") {
    // request.parameters is correctly narrowed to { fragment?: string }
    const _fragment: string | undefined = request.parameters.fragment;
    void _fragment;
    return { validity: "valid" };
  }

  if (request.field === "template_vars") {
    // request.parameters is correctly narrowed to Record<string, never>
    const _params: Record<string, never> = request.parameters;
    void _params;
    return { validity: "valid" };
  }

  if (request.field === "crm_object") {
    // request.parameters is correctly narrowed to { fragment?: string }
    const _fragment: string | undefined = request.parameters.fragment;
    void _fragment;
    return { validity: "valid" };
  }

  if (request.field === "field_mapping") {
    // request.parameters is correctly narrowed to Record<string, never>
    const _params: Record<string, never> = request.parameters;
    void _params;
    return { validity: "valid" };
  }

  // Exhaustiveness check - this should be unreachable
  const _exhaustive: never = request;
  void _exhaustive;
  return { validity: "unknown" };
}

/**
 * APPROACH 3: Discriminated union with switch
 */
export function fetchOptionsUnionSwitch(
  request: FetchOptionsRequestUnion
): FetchOptionsResponse {
  switch (request.field) {
    case "template_id": {
      // Narrowed correctly!
      const _fragment: string | undefined = request.parameters.fragment;
      void _fragment;
      return { validity: "valid" };
    }
    case "template_vars": {
      const _params: Record<string, never> = request.parameters;
      void _params;
      return { validity: "valid" };
    }
    case "crm_object": {
      const _fragment: string | undefined = request.parameters.fragment;
      void _fragment;
      return { validity: "valid" };
    }
    case "field_mapping": {
      const _params: Record<string, never> = request.parameters;
      void _params;
      return { validity: "valid" };
    }
    default: {
      const _exhaustive: never = request;
      void _exhaustive;
      return { validity: "unknown" };
    }
  }
}

/**
 * APPROACH 4: (DEPRECATED)
 *
 * The two-type-param pattern (fetchOptionsObjectTwoParams) provides
 * call-site safety AND internal narrowing without needing to cast to union.
 * This approach is no longer needed.
 */

/**
 * Type helper to create the union from FieldParameterMap
 * This demonstrates how to auto-generate the union type.
 */
export type CreateFetchOptionsRequestUnion<Map extends Record<string, unknown>> = {
  [F in keyof Map]: {
    field: F;
    form_state: FormState<Record<string, unknown>>;
    parameters: Map[F];
  };
}[keyof Map];

// Verify it produces the same type
type _VerifyUnionType = CreateFetchOptionsRequestUnion<FieldParameterMap>;
const _checkAssignable: _VerifyUnionType = {} as FetchOptionsRequestUnion;
void _checkAssignable;
