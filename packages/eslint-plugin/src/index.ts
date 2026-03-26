/**
 * \@formspec/eslint-plugin
 *
 * ESLint plugin for FormSpec constraint validation.
 *
 * Provides rules to:
 * - Validate JSDoc constraints on class/interface fields
 * - Validate Chain DSL usage against project constraints
 * - Ensure forms comply with target environment capabilities
 */

import type { TSESLint } from "@typescript-eslint/utils";
import { constraintTypeMismatch } from "./rules/constraint-type-mismatch.js";
import { consistentConstraints } from "./rules/consistent-constraints.js";

// Constraint rules for Chain DSL
import { allowedFieldTypes, allowedLayouts } from "./rules/constraints/index.js";

/**
 * All rules provided by this plugin.
 */
const rules = {
  // JSDoc constraint rules
  "constraint-type-mismatch": constraintTypeMismatch,
  "consistent-constraints": consistentConstraints,

  // Constraint rules for Chain DSL
  "constraints-allowed-field-types": allowedFieldTypes,
  "constraints-allowed-layouts": allowedLayouts,
} as const;

/**
 * Plugin metadata.
 */
const meta = {
  name: "@formspec/eslint-plugin",
};

/**
 * Recommended configuration for FormSpec projects.
 *
 * Usage:
 * ```javascript
 * import formspec from "@formspec/eslint-plugin";
 *
 * export default [
 *   ...formspec.configs.recommended,
 * ];
 * ```
 */
const recommendedConfig: TSESLint.FlatConfig.ConfigArray = [
  {
    plugins: {
      "@formspec": {
        meta,
        rules,
      },
    },
    rules: {
      "@formspec/constraint-type-mismatch": "error",
      "@formspec/consistent-constraints": "error",
    },
  },
];

/**
 * Strict configuration - all rules as errors.
 */
const strictConfig: TSESLint.FlatConfig.ConfigArray = [
  {
    plugins: {
      "@formspec": {
        meta,
        rules,
      },
    },
    rules: {
      "@formspec/constraint-type-mismatch": "error",
      "@formspec/consistent-constraints": "error",
    },
  },
];

/**
 * The FormSpec ESLint plugin.
 */
const plugin = {
  meta,
  rules,
  configs: {
    recommended: recommendedConfig,
    strict: strictConfig,
  },
};

export default plugin;

// Named exports for individual rules
export {
  // JSDoc constraint rules
  constraintTypeMismatch,
  consistentConstraints,
  // Constraint rules for Chain DSL
  allowedFieldTypes,
  allowedLayouts,
};
