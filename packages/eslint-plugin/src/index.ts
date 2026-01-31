/**
 * @formspec/eslint-plugin
 *
 * ESLint plugin for FormSpec decorator DSL type safety.
 *
 * Provides rules to catch common mistakes when using FormSpec decorators:
 * - Type mismatches between decorators and field types
 * - Invalid enum option configurations
 * - Missing or invalid @ShowWhen references
 * - Conflicting or duplicate decorators
 */

import type { TSESLint } from "@typescript-eslint/utils";
import { decoratorFieldTypeMismatch } from "./rules/decorator-field-type-mismatch.js";
import { enumOptionsMatchType } from "./rules/enum-options-match-type.js";
import { showwhenFieldExists } from "./rules/showwhen-field-exists.js";
import { showwhenSuggestsOptional } from "./rules/showwhen-suggests-optional.js";
import { minMaxValidRange } from "./rules/min-max-valid-range.js";
import { noConflictingDecorators } from "./rules/no-conflicting-decorators.js";
import { noDuplicateDecorators } from "./rules/no-duplicate-decorators.js";

/**
 * All rules provided by this plugin.
 */
const rules = {
  "decorator-field-type-mismatch": decoratorFieldTypeMismatch,
  "enum-options-match-type": enumOptionsMatchType,
  "showwhen-field-exists": showwhenFieldExists,
  "showwhen-suggests-optional": showwhenSuggestsOptional,
  "min-max-valid-range": minMaxValidRange,
  "no-conflicting-decorators": noConflictingDecorators,
  "no-duplicate-decorators": noDuplicateDecorators,
} as const;

/**
 * Plugin metadata.
 */
const meta = {
  name: "@formspec/eslint-plugin",
  version: "0.1.0",
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
  decoratorFieldTypeMismatch,
  enumOptionsMatchType,
  showwhenFieldExists,
  showwhenSuggestsOptional,
  minMaxValidRange,
  noConflictingDecorators,
  noDuplicateDecorators,
};
