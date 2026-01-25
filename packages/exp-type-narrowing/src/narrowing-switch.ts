/**
 * Experiment: Switch statement narrowing patterns
 *
 * Exploring different switch patterns for exhaustive handling of field types.
 */

import type {
  FieldParameterMap,
  FetchOptionsResponse,
  FetchOptionsRequestUnion,
} from "./types.js";

/**
 * Pattern 1: Switch with exhaustiveness via never
 */
export function handleFieldSwitch(
  request: FetchOptionsRequestUnion
): FetchOptionsResponse {
  switch (request.field) {
    case "template_id":
      return handleTemplateId(request.parameters);
    case "template_vars":
      return handleTemplateVars();
    case "crm_object":
      return handleCrmObject(request.parameters);
    case "field_mapping":
      return handleFieldMapping();
    default:
      // Exhaustiveness check
      return assertNever(request);
  }
}

function handleTemplateId(params: { fragment?: string }): FetchOptionsResponse {
  const _fragment = params.fragment;
  void _fragment;
  return { validity: "valid" };
}

function handleTemplateVars(): FetchOptionsResponse {
  return { validity: "valid" };
}

function handleCrmObject(params: { fragment?: string }): FetchOptionsResponse {
  const _fragment = params.fragment;
  void _fragment;
  return { validity: "valid" };
}

function handleFieldMapping(): FetchOptionsResponse {
  return { validity: "valid" };
}

function assertNever(x: never): never {
  throw new Error(`Unexpected field: ${JSON.stringify(x)}`);
}

/**
 * Pattern 2: Object lookup table with handlers
 *
 * This provides a declarative way to handle all fields.
 */
type FieldHandlerMap = {
  [F in keyof FieldParameterMap]: (
    parameters: FieldParameterMap[F]
  ) => FetchOptionsResponse;
};

const fieldHandlers: FieldHandlerMap = {
  template_id: (params) => {
    // params is correctly typed as { fragment?: string }
    const _fragment = params.fragment;
    void _fragment;
    return { validity: "valid" };
  },
  template_vars: (_params) => {
    // params is correctly typed as Record<string, never>
    return { validity: "valid" };
  },
  crm_object: (params) => {
    const _fragment = params.fragment;
    void _fragment;
    return { validity: "valid" };
  },
  field_mapping: (_params) => {
    return { validity: "valid" };
  },
};

export function handleFieldLookup(
  request: FetchOptionsRequestUnion
): FetchOptionsResponse {
  // TypeScript knows request.field is a valid key
  const handler = fieldHandlers[request.field];

  // But here we have a type mismatch issue:
  // handler expects the specific parameter type for request.field
  // but we're passing request.parameters which is the union of all parameter types

  // We need to cast because TS can't correlate the handler lookup with the parameters
  return (handler as (params: FieldParameterMap[keyof FieldParameterMap]) => FetchOptionsResponse)(
    request.parameters
  );
}

/**
 * Pattern 3: Type-safe lookup using a helper
 *
 * This achieves full type safety by using a different structure.
 */
export function createTypeSafeDispatcher<
  Map extends Record<string, unknown>,
  Result,
>(handlers: { [K in keyof Map]: (params: Map[K]) => Result }) {
  type RequestUnion = {
    [K in keyof Map]: { field: K; parameters: Map[K] };
  }[keyof Map];

  return function dispatch(request: RequestUnion): Result {
    // This cast is safe because we know the field and parameters are correlated
    const handler = handlers[request.field as keyof Map] as (
      params: Map[keyof Map]
    ) => Result;
    return handler(request.parameters);
  };
}

// Usage:
export const dispatchFetchOptions = createTypeSafeDispatcher<
  FieldParameterMap,
  FetchOptionsResponse
>({
  template_id: (params) => {
    const _fragment = params.fragment;
    void _fragment;
    return { validity: "valid" };
  },
  template_vars: (_params) => {
    return { validity: "valid" };
  },
  crm_object: (params) => {
    const _fragment = params.fragment;
    void _fragment;
    return { validity: "valid" };
  },
  field_mapping: (_params) => {
    return { validity: "valid" };
  },
});
