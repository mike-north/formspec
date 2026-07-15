import type { DSLPolicy, ResolvedDSLPolicy } from "./types.js";

/**
 * Default DSL-policy configuration that allows all features.
 *
 * @beta
 */
export const DEFAULT_DSL_POLICY: ResolvedDSLPolicy = {
  fieldTypes: {
    text: "off",
    number: "off",
    boolean: "off",
    staticEnum: "off",
    dynamicEnum: "off",
    dynamicSchema: "off",
    array: "off",
    object: "off",
  },
  layout: {
    group: "off",
    conditionals: "off",
    maxNestingDepth: Infinity,
  },
  uiSchema: {
    layouts: {
      VerticalLayout: "off",
      HorizontalLayout: "off",
      Group: "off",
      Categorization: "off",
      Category: "off",
    },
    rules: {
      enabled: "off",
      effects: {
        SHOW: "off",
        HIDE: "off",
        ENABLE: "off",
        DISABLE: "off",
      },
    },
  },
  fieldOptions: {
    label: "off",
    placeholder: "off",
    required: "off",
    minValue: "off",
    maxValue: "off",
    minItems: "off",
    maxItems: "off",
  },
  controlOptions: {
    format: "off",
    readonly: "off",
    multi: "off",
    showUnfocusedDescription: "off",
    hideRequiredAsterisk: "off",
    custom: {},
  },
};

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
  // Always build a fresh nested object graph, even when `config` is absent. Returning
  // `DEFAULT_DSL_POLICY` by reference here would let a caller that mutates its "resolved"
  // policy corrupt the shared module-level default (and `DEFAULT_CONSTRAINTS`, which aliases
  // the same object) for every subsequent caller.
  const resolvedConfig = config ?? {};

  return {
    fieldTypes: {
      ...DEFAULT_DSL_POLICY.fieldTypes,
      ...resolvedConfig.fieldTypes,
    },
    layout: {
      ...DEFAULT_DSL_POLICY.layout,
      ...resolvedConfig.layout,
    },
    uiSchema: {
      layouts: {
        ...DEFAULT_DSL_POLICY.uiSchema.layouts,
        ...resolvedConfig.uiSchema?.layouts,
      },
      rules: {
        enabled:
          resolvedConfig.uiSchema?.rules?.enabled ?? DEFAULT_DSL_POLICY.uiSchema.rules.enabled,
        effects: {
          ...DEFAULT_DSL_POLICY.uiSchema.rules.effects,
          ...resolvedConfig.uiSchema?.rules?.effects,
        },
      },
    },
    fieldOptions: {
      ...DEFAULT_DSL_POLICY.fieldOptions,
      ...resolvedConfig.fieldOptions,
    },
    controlOptions: {
      ...DEFAULT_DSL_POLICY.controlOptions,
      ...resolvedConfig.controlOptions,
      custom: {
        ...DEFAULT_DSL_POLICY.controlOptions.custom,
        ...resolvedConfig.controlOptions?.custom,
      },
    },
  };
}

/**
 * Creates a DSL policy directly from an object.
 * Useful for programmatic configuration without a config file.
 *
 * @beta
 */
export function defineDSLPolicy(config: DSLPolicy): ResolvedDSLPolicy {
  return mergeWithDefaults(config);
}

/**
 * Creates a DSL policy directly from an object.
 *
 * @deprecated Use `defineDSLPolicy`.
 * @beta
 */
export function defineConstraints(config: DSLPolicy): ResolvedDSLPolicy {
  return defineDSLPolicy(config);
}
