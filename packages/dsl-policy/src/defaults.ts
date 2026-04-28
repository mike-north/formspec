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
  if (!config) {
    return DEFAULT_DSL_POLICY;
  }

  return {
    fieldTypes: {
      ...DEFAULT_DSL_POLICY.fieldTypes,
      ...config.fieldTypes,
    },
    layout: {
      ...DEFAULT_DSL_POLICY.layout,
      ...config.layout,
    },
    uiSchema: {
      layouts: {
        ...DEFAULT_DSL_POLICY.uiSchema.layouts,
        ...config.uiSchema?.layouts,
      },
      rules: {
        enabled: config.uiSchema?.rules?.enabled ?? DEFAULT_DSL_POLICY.uiSchema.rules.enabled,
        effects: {
          ...DEFAULT_DSL_POLICY.uiSchema.rules.effects,
          ...config.uiSchema?.rules?.effects,
        },
      },
    },
    fieldOptions: {
      ...DEFAULT_DSL_POLICY.fieldOptions,
      ...config.fieldOptions,
    },
    controlOptions: {
      ...DEFAULT_DSL_POLICY.controlOptions,
      ...config.controlOptions,
      custom: {
        ...DEFAULT_DSL_POLICY.controlOptions.custom,
        ...config.controlOptions?.custom,
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
export const defineConstraints = defineDSLPolicy;
