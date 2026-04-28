import {
  DEFAULT_DSL_POLICY as INTERNAL_DEFAULT_DSL_POLICY,
  defineDSLPolicy as defineInternalDSLPolicy,
  mergeWithDefaults as mergeInternalWithDefaults,
} from "@formspec/dsl-policy";
import type { DSLPolicy, FormSpecConfig, ResolvedDSLPolicy } from "./types.js";

/**
 * Default DSL-policy configuration that allows all features.
 *
 * @beta
 */
export const DEFAULT_DSL_POLICY: ResolvedDSLPolicy = INTERNAL_DEFAULT_DSL_POLICY;

/**
 * Default DSL-policy configuration that allows all features.
 *
 * @deprecated Use `DEFAULT_DSL_POLICY`.
 * @beta
 */
export const DEFAULT_CONSTRAINTS = DEFAULT_DSL_POLICY;

/**
 * Merges user policy with defaults.
 *
 * @beta
 */
export function mergeWithDefaults(config: DSLPolicy | undefined): ResolvedDSLPolicy {
  return mergeInternalWithDefaults(config);
}

/**
 * Creates a DSL policy directly from an object.
 * Useful for programmatic configuration without a config file.
 *
 * @beta
 */
export function defineDSLPolicy(config: DSLPolicy): ResolvedDSLPolicy {
  return defineInternalDSLPolicy(config);
}

/**
 * Creates a DSL policy directly from an object.
 *
 * @deprecated Use `defineDSLPolicy`.
 * @beta
 */
export const defineConstraints = defineDSLPolicy;

/**
 * Default FormSpec configuration.
 *
 * @beta
 */
export const DEFAULT_CONFIG: FormSpecConfig = {
  constraints: DEFAULT_DSL_POLICY,
};
