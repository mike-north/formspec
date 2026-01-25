/**
 * Experiment: Custom type guards for narrowing
 *
 * CONCLUSION: With the two-type-param pattern, type guards are less necessary
 * since narrowing works automatically. But they can still be useful for
 * exhaustive checking.
 */

import type {
  FieldParameterMap,
  FetchOptionsResponse,
  FetchOptionsRequestUnion,
} from "./types.js";

/**
 * Type guard using Extract - works with the union type
 */
function isFieldRequest<F extends keyof FieldParameterMap>(
  request: FetchOptionsRequestUnion,
  field: F
): request is Extract<FetchOptionsRequestUnion, { field: F }> {
  return request.field === field;
}

/**
 * Example: Using type guards with the union for exhaustive handling
 */
export function fetchOptionsWithTypeGuard(
  request: FetchOptionsRequestUnion
): FetchOptionsResponse {
  if (isFieldRequest(request, "template_id")) {
    const _fragment = request.parameters.fragment;
    void _fragment;
    return { validity: "valid" };
  }

  if (isFieldRequest(request, "template_vars")) {
    return { validity: "valid" };
  }

  if (isFieldRequest(request, "crm_object")) {
    const _fragment = request.parameters.fragment;
    void _fragment;
    return { validity: "valid" };
  }

  if (isFieldRequest(request, "field_mapping")) {
    return { validity: "valid" };
  }

  // Exhaustiveness check
  const _exhaustive: never = request;
  void _exhaustive;
  return { validity: "unknown" };
}

/**
 * Direct narrowing (baseline) - works just as well without type guards
 */
export function fetchOptionsDirectNarrowing(
  request: FetchOptionsRequestUnion
): FetchOptionsResponse {
  if (request.field === "template_id") {
    const _fragment = request.parameters.fragment;
    void _fragment;
    return { validity: "valid" };
  }

  if (request.field === "template_vars") {
    return { validity: "valid" };
  }

  if (request.field === "crm_object") {
    const _fragment = request.parameters.fragment;
    void _fragment;
    return { validity: "valid" };
  }

  if (request.field === "field_mapping") {
    return { validity: "valid" };
  }

  const _exhaustive: never = request;
  void _exhaustive;
  return { validity: "unknown" };
}
