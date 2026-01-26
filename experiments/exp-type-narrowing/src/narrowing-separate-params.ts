/**
 * Experiment: Does TypeScript narrow parameters when using separate function params?
 *
 * This tests the pattern:
 *   fetchOptions(field, formState, parameters)
 *
 * Where `field` and `parameters` are correlated via a generic constraint.
 */

import type {
  FieldParameterMap,
  FormState,
  FetchOptionsResponse,
} from "./types.js";

/**
 * APPROACH 1: Generic function with correlated params
 *
 * FINDING: TypeScript allows accessing `parameters.fragment` even without narrowing!
 * This is because Record<string, never> allows any string index (returning `never`),
 * so the union type `{ fragment?: string } | Record<string, never>` allows `.fragment`.
 *
 * However, the TYPE of `parameters` is NOT narrowed - it's still `FieldParameterMap[F]`.
 * You can access properties that happen to exist on the union, but you can't assign
 * `parameters` to a more specific type without assertion.
 */
export function fetchOptionsSeparateParams<F extends keyof FieldParameterMap>(
  field: F,
  _formState: FormState<Record<string, unknown>>,
  parameters: FieldParameterMap[F]
): FetchOptionsResponse {
  if (field === "template_id") {
    // Can access .fragment because it's allowed on the union
    // (Record<string, never> allows any string index)
    const _fragment: string | undefined = parameters.fragment;
    void _fragment;

    // But parameters is NOT narrowed to { fragment?: string }
    // This assignment would fail without type assertion:
    // const _specific: { fragment?: string } = parameters; // Error!
  }

  return { validity: "unknown" };
}

/**
 * APPROACH 1b: Two type parameters with constraint
 *
 * FINDING: This DOES enable narrowing!
 *
 * When K narrows to "template_id", the constraint `Params extends FieldParameterMap[K]`
 * becomes `Params extends { fragment?: string }`, so we can access .fragment safely.
 */
export function fetchOptionsTwoTypeParams<
  K extends keyof FieldParameterMap,
  Params extends FieldParameterMap[K],
>(
  field: K,
  _formState: FormState<Record<string, unknown>>,
  parameters: Params
): FetchOptionsResponse {
  if (field === "template_id") {
    // K is narrowed to "template_id"
    const _kValue: "template_id" = field;
    void _kValue;

    // Params is constrained to extend { fragment?: string }
    // So we can safely access .fragment!
    const fragment = parameters.fragment;
    console.log("Fragment:", fragment);

    return { validity: "valid", options: [] };
  }

  if (field === "template_vars") {
    // K is narrowed to "template_vars"
    // Params extends Record<string, never>
    // Can't access any properties (correctly!)
    return { validity: "valid" };
  }

  return { validity: "unknown" };
}

// Call-site test: Does this provide good type safety for callers?
export function testCallSite() {
  // Good: correct pairing
  fetchOptionsTwoTypeParams("template_id", {} as FormState<Record<string, unknown>>, {
    fragment: "search",
  });

  // Good: empty object for template_vars
  fetchOptionsTwoTypeParams("template_vars", {} as FormState<Record<string, unknown>>, {});

  // Should error: wrong params for field
  fetchOptionsTwoTypeParams("template_vars", {} as FormState<Record<string, unknown>>, {
    // @ts-expect-error - fragment not allowed for template_vars
    fragment: "search",
  });
}

/**
 * APPROACH 2: Overloaded function signatures
 *
 * This provides better call-site type checking but doesn't help inside the implementation.
 */
export function fetchOptionsOverloaded(
  field: "template_id",
  formState: FormState<Record<string, unknown>>,
  parameters: { fragment?: string }
): FetchOptionsResponse;
export function fetchOptionsOverloaded(
  field: "template_vars",
  formState: FormState<Record<string, unknown>>,
  parameters: Record<string, never>
): FetchOptionsResponse;
export function fetchOptionsOverloaded(
  field: "crm_object",
  formState: FormState<Record<string, unknown>>,
  parameters: { fragment?: string }
): FetchOptionsResponse;
export function fetchOptionsOverloaded(
  field: "field_mapping",
  formState: FormState<Record<string, unknown>>,
  parameters: Record<string, never>
): FetchOptionsResponse;
export function fetchOptionsOverloaded(
  field: keyof FieldParameterMap,
  _formState: FormState<Record<string, unknown>>,
  parameters: FieldParameterMap[keyof FieldParameterMap]
): FetchOptionsResponse {
  // Inside implementation, still need to narrow manually
  if (field === "template_id") {
    // Now we can access .fragment but with a type guard
    const params = parameters as { fragment?: string };
    const _fragment = params.fragment;
    void _fragment;
  }

  return { validity: "unknown" };
}

/**
 * APPROACH 3: Callback pattern - let callers provide narrowed handlers
 *
 * This shifts the burden to the caller but gives perfect type safety.
 */
type FieldHandler<F extends keyof FieldParameterMap> = (
  formState: FormState<Record<string, unknown>>,
  parameters: FieldParameterMap[F]
) => FetchOptionsResponse;

type FieldHandlers = {
  [F in keyof FieldParameterMap]: FieldHandler<F>;
};

export function createFetchOptionsRouter(handlers: FieldHandlers) {
  return function fetchOptions<F extends keyof FieldParameterMap>(
    field: F,
    formState: FormState<Record<string, unknown>>,
    parameters: FieldParameterMap[F]
  ): FetchOptionsResponse {
    // Safe: handlers[field] is typed as FieldHandler<F>
    return handlers[field](formState, parameters);
  };
}

// Usage example:
export const fetchOptionsFromRouter = createFetchOptionsRouter({
  template_id: (_formState, parameters) => {
    // parameters is correctly typed as { fragment?: string }
    const _fragment = parameters.fragment;
    void _fragment;
    return { validity: "unknown" };
  },
  template_vars: (_formState, _parameters) => {
    // parameters is correctly typed as Record<string, never>
    return { validity: "unknown" };
  },
  crm_object: (_formState, parameters) => {
    const _fragment = parameters.fragment;
    void _fragment;
    return { validity: "unknown" };
  },
  field_mapping: (_formState, _parameters) => {
    return { validity: "unknown" };
  },
});
