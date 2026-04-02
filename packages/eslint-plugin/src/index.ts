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
import packageJson from "../package.json" with { type: "json" };
import {
  noUnknownTags,
  requireTagArguments,
  noDisabledTags,
  noMarkdownFormatting,
  validNumericValue,
  validIntegerValue,
  validRegexPattern,
  validJsonValue,
  tagTypeCheck,
  validPathTarget,
  validMemberTarget,
  noUnsupportedTargeting,
  noMemberTargetOnObject,
  noContradictions,
  noDuplicateTags,
  noDescriptionTag,
  noContradictoryRules,
} from "./rules/index.js";

// Constraint rules for Chain DSL
import { allowedFieldTypes, allowedLayouts } from "./rules/constraints/index.js";

/**
 * All rules provided by this plugin.
 *
 * @public
 */
export const rules = {
  // Spec built-in rules
  "tag-recognition/no-unknown-tags": noUnknownTags,
  "tag-recognition/require-tag-arguments": requireTagArguments,
  "tag-recognition/no-disabled-tags": noDisabledTags,
  "tag-recognition/no-markdown-formatting": noMarkdownFormatting,
  "value-parsing/valid-numeric-value": validNumericValue,
  "value-parsing/valid-integer-value": validIntegerValue,
  "value-parsing/valid-regex-pattern": validRegexPattern,
  "value-parsing/valid-json-value": validJsonValue,
  "type-compatibility/tag-type-check": tagTypeCheck,
  "target-resolution/valid-path-target": validPathTarget,
  "target-resolution/valid-member-target": validMemberTarget,
  "target-resolution/no-unsupported-targeting": noUnsupportedTargeting,
  "target-resolution/no-member-target-on-object": noMemberTargetOnObject,
  "constraint-validation/no-contradictions": noContradictions,
  "constraint-validation/no-duplicate-tags": noDuplicateTags,
  "constraint-validation/no-description-tag": noDescriptionTag,
  "constraint-validation/no-contradictory-rules": noContradictoryRules,

  // Constraint rules for Chain DSL
  "constraints-allowed-field-types": allowedFieldTypes,
  "constraints-allowed-layouts": allowedLayouts,
} as const;

/**
 * Plugin metadata.
 *
 * @public
 */
export const meta = {
  name: "@formspec/eslint-plugin",
  version: packageJson.version,
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
      formspec: {
        meta,
        rules,
      },
    },
    rules: {
      "formspec/tag-recognition/no-unknown-tags": "warn",
      "formspec/tag-recognition/require-tag-arguments": "error",
      "formspec/tag-recognition/no-disabled-tags": "warn",
      "formspec/value-parsing/valid-numeric-value": "error",
      "formspec/value-parsing/valid-integer-value": "error",
      "formspec/value-parsing/valid-regex-pattern": "error",
      "formspec/value-parsing/valid-json-value": "error",
      "formspec/type-compatibility/tag-type-check": "error",
      "formspec/target-resolution/valid-path-target": "error",
      "formspec/target-resolution/valid-member-target": "error",
      "formspec/target-resolution/no-unsupported-targeting": "error",
      "formspec/target-resolution/no-member-target-on-object": "error",
      "formspec/constraint-validation/no-contradictions": "error",
      "formspec/constraint-validation/no-duplicate-tags": "warn",
      "formspec/constraint-validation/no-description-tag": "error",
      "formspec/constraint-validation/no-contradictory-rules": "error",
    },
  },
];

/**
 * Strict configuration - all rules as errors.
 */
const strictConfig: TSESLint.FlatConfig.ConfigArray = [
  {
    plugins: {
      formspec: {
        meta,
        rules,
      },
    },
    rules: {
      "formspec/tag-recognition/no-unknown-tags": "error",
      "formspec/tag-recognition/require-tag-arguments": "error",
      "formspec/tag-recognition/no-disabled-tags": "error",
      "formspec/value-parsing/valid-numeric-value": "error",
      "formspec/value-parsing/valid-integer-value": "error",
      "formspec/value-parsing/valid-regex-pattern": "error",
      "formspec/value-parsing/valid-json-value": "error",
      "formspec/type-compatibility/tag-type-check": "error",
      "formspec/target-resolution/valid-path-target": "error",
      "formspec/target-resolution/valid-member-target": "error",
      "formspec/target-resolution/no-unsupported-targeting": "error",
      "formspec/target-resolution/no-member-target-on-object": "error",
      "formspec/constraint-validation/no-contradictions": "error",
      "formspec/constraint-validation/no-duplicate-tags": "error",
      "formspec/constraint-validation/no-description-tag": "error",
      "formspec/constraint-validation/no-contradictory-rules": "error",
    },
  },
];

/**
 * Preset configurations for FormSpec projects.
 *
 * @public
 */
export const configs = {
  recommended: recommendedConfig,
  strict: strictConfig,
} as const;

/**
 * The FormSpec ESLint plugin.
 *
 * @public
 */
const plugin = {
  meta,
  rules,
  configs,
};

export default plugin;

// Named exports for individual rules
export {
  noUnknownTags,
  requireTagArguments,
  noDisabledTags,
  noMarkdownFormatting,
  validNumericValue,
  validIntegerValue,
  validRegexPattern,
  validJsonValue,
  tagTypeCheck,
  validPathTarget,
  validMemberTarget,
  noUnsupportedTargeting,
  noMemberTargetOnObject,
  noContradictions,
  noDuplicateTags,
  noDescriptionTag,
  noContradictoryRules,
  // Constraint rules for Chain DSL
  allowedFieldTypes,
  allowedLayouts,
};
