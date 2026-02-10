import type { ConstraintConfig, FormSpecConfig, ResolvedConstraintConfig } from "./types.js";

/**
 * Default constraint configuration that allows all features.
 * All constraints default to "off" (allowed).
 */
export const DEFAULT_CONSTRAINTS: ResolvedConstraintConfig = {
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
 * Default FormSpec configuration.
 */
export const DEFAULT_CONFIG: FormSpecConfig = {
  constraints: DEFAULT_CONSTRAINTS,
};

/**
 * Merges user constraints with defaults, filling in any missing values.
 */
export function mergeWithDefaults(
  config: ConstraintConfig | undefined
): ResolvedConstraintConfig {
  if (!config) {
    return DEFAULT_CONSTRAINTS;
  }

  return {
    fieldTypes: {
      ...DEFAULT_CONSTRAINTS.fieldTypes,
      ...config.fieldTypes,
    },
    layout: {
      ...DEFAULT_CONSTRAINTS.layout,
      ...config.layout,
    },
    uiSchema: {
      layouts: {
        ...DEFAULT_CONSTRAINTS.uiSchema.layouts,
        ...config.uiSchema?.layouts,
      },
      rules: {
        enabled: config.uiSchema?.rules?.enabled ?? DEFAULT_CONSTRAINTS.uiSchema.rules.enabled,
        effects: {
          ...DEFAULT_CONSTRAINTS.uiSchema.rules.effects,
          ...config.uiSchema?.rules?.effects,
        },
      },
    },
    fieldOptions: {
      ...DEFAULT_CONSTRAINTS.fieldOptions,
      ...config.fieldOptions,
    },
    controlOptions: {
      ...DEFAULT_CONSTRAINTS.controlOptions,
      ...config.controlOptions,
      custom: {
        ...DEFAULT_CONSTRAINTS.controlOptions.custom,
        ...config.controlOptions?.custom,
      },
    },
  };
}
