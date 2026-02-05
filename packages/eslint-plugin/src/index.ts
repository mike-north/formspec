/**
 * @formspec/eslint-plugin
 *
 * ESLint plugin for FormSpec type safety and constraint validation.
 *
 * Provides rules to:
 * - Catch common mistakes when using FormSpec decorators
 * - Validate Chain DSL usage against project constraints
 * - Ensure forms comply with target environment capabilities
 */

import type { TSESLint } from "@typescript-eslint/utils";
import { decoratorFieldTypeMismatch } from "./rules/decorator-field-type-mismatch.js";
import { enumOptionsMatchType } from "./rules/enum-options-match-type.js";
import { showwhenFieldExists } from "./rules/showwhen-field-exists.js";
import { showwhenSuggestsOptional } from "./rules/showwhen-suggests-optional.js";
import { minMaxValidRange } from "./rules/min-max-valid-range.js";
import { noConflictingDecorators } from "./rules/no-conflicting-decorators.js";
import { noDuplicateDecorators } from "./rules/no-duplicate-decorators.js";

// Constraint rules for Chain DSL
import {
  allowedFieldTypes,
  allowedLayouts,
} from "./rules/constraints/index.js";

/**
 * All rules provided by this plugin.
 */
const rules = {
  // Decorator DSL rules
  "decorator-field-type-mismatch": decoratorFieldTypeMismatch,
  "enum-options-match-type": enumOptionsMatchType,
  "showwhen-field-exists": showwhenFieldExists,
  "showwhen-suggests-optional": showwhenSuggestsOptional,
  "min-max-valid-range": minMaxValidRange,
  "no-conflicting-decorators": noConflictingDecorators,
  "no-duplicate-decorators": noDuplicateDecorators,

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
      "@formspec/decorator-field-type-mismatch": "error",
      "@formspec/enum-options-match-type": "error",
      "@formspec/showwhen-field-exists": "error",
      "@formspec/showwhen-suggests-optional": "warn",
      "@formspec/min-max-valid-range": "error",
      "@formspec/no-conflicting-decorators": "error",
      "@formspec/no-duplicate-decorators": "error",
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
      "@formspec/decorator-field-type-mismatch": "error",
      "@formspec/enum-options-match-type": "error",
      "@formspec/showwhen-field-exists": "error",
      "@formspec/showwhen-suggests-optional": "error",
      "@formspec/min-max-valid-range": "error",
      "@formspec/no-conflicting-decorators": "error",
      "@formspec/no-duplicate-decorators": "error",
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
  // Decorator DSL rules
  decoratorFieldTypeMismatch,
  enumOptionsMatchType,
  showwhenFieldExists,
  showwhenSuggestsOptional,
  minMaxValidRange,
  noConflictingDecorators,
  noDuplicateDecorators,
  // Constraint rules for Chain DSL
  allowedFieldTypes,
  allowedLayouts,
};
