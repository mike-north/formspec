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

function getDefaultDSLPolicyAlias(): ResolvedDSLPolicy {
  return DEFAULT_DSL_POLICY;
}

/**
 * Default DSL-policy configuration that allows all features.
 *
 * @deprecated Use `DEFAULT_DSL_POLICY`.
 * @beta
 */
export const DEFAULT_CONSTRAINTS: ResolvedDSLPolicy = getDefaultDSLPolicyAlias();

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
 * @public
 */
export function defineDSLPolicy(config: DSLPolicy): ResolvedDSLPolicy {
  return defineInternalDSLPolicy(config);
}

/**
 * Creates a DSL policy directly from an object.
 *
 * @deprecated Use `defineDSLPolicy`.
 * @public
 */
export function defineConstraints(config: DSLPolicy): ResolvedDSLPolicy {
  return defineDSLPolicy(config);
}

/**
 * Default FormSpec configuration.
 *
 * @beta
 */
export const DEFAULT_CONFIG: FormSpecConfig = {
  constraints: DEFAULT_DSL_POLICY,
};
