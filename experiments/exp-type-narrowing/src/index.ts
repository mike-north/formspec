/**
 * @formspec/exp-type-narrowing
 *
 * Experiment package for testing TypeScript type narrowing patterns
 * for the fetchOptions contract in the formspec DSL.
 *
 * KEY DECISION: Use two type parameters for the request type:
 *
 *   type FetchOptionsRequest<
 *     K extends keyof FieldParameterMap,
 *     Params extends FieldParameterMap[K],
 *   > = { field: K; form_state: FormState; parameters: Params };
 *
 * This enables narrowing: when checking `request.field === "template_id"`,
 * K narrows to "template_id" and Params follows via its constraint.
 */

// Core types
export type {
  Validity,
  FieldState,
  FormState,
  OptionItem,
  FetchOptionsResponse,
  FieldParameterMap,
  FetchOptionsRequest,
  FetchOptionsRequestUnion,
} from "./types.js";

// Recommended pattern: Two type params with object
export {
  fetchOptionsObjectTwoParams,
  testObjectCallSite,
  type CreateFetchOptionsRequestUnion,
} from "./narrowing-object-param.js";

// Alternative patterns (for reference)
export {
  fetchOptionsTwoTypeParams,
  testCallSite,
  createFetchOptionsRouter,
  fetchOptionsFromRouter,
} from "./narrowing-separate-params.js";

// Union-based patterns
export {
  fetchOptionsUnion,
  fetchOptionsUnionSwitch,
} from "./narrowing-object-param.js";

// Type guard patterns
export {
  fetchOptionsWithTypeGuard,
  fetchOptionsDirectNarrowing,
} from "./narrowing-typeguard.js";
