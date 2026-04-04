/**
 * ESLint plugin entrypoint for validating FormSpec authoring patterns across
 * TSDoc-annotated types and the chain DSL.
 *
 * Provides flat-config presets plus individually addressable rules for tag
 * recognition, value parsing, target resolution, and constraint validation.
 *
 * @packageDocumentation
 */
import type { TSESLint } from "@typescript-eslint/utils";
import packageJson from "../package.json" with { type: "json" };
import {
  noUnknownTags,
  requireTagArguments,
  validNumericValue,
  validIntegerValue,
  validRegexPattern,
  validJsonValue,
  tagTypeCheck,
  validPathTarget,
  validMemberTarget,
  noUnsupportedTargeting,
  noMemberTargetOnObject,
  noDuplicateTags,
  noDescriptionTag,
  noContradictoryRules,
} from "./rules/index.js";
import {
  noContradictions as noContradictionsRule,
  type MessageIds as NoContradictionsMessageIds,
} from "./rules/constraint-validation/no-contradictions.js";
import {
  allowedFieldTypes as allowedFieldTypesRule,
  type MessageIds as AllowedFieldTypesMessageIds,
  type Options as AllowedFieldTypesOptions,
} from "./rules/constraints/allowed-field-types.js";
import {
  allowedLayouts as allowedLayoutsRule,
  type MessageIds as AllowedLayoutsMessageIds,
  type Options as AllowedLayoutsOptions,
} from "./rules/constraints/allowed-layouts.js";
import {
  noDisabledTags as noDisabledTagsRule,
  type MessageIds as NoDisabledTagsMessageIds,
  type Options as NoDisabledTagsOptions,
} from "./rules/tag-recognition/no-disabled-tags.js";
import {
  noMarkdownFormatting as noMarkdownFormattingRule,
  type MessageIds as NoMarkdownFormattingMessageIds,
  type Options as NoMarkdownFormattingOptions,
} from "./rules/tag-recognition/no-markdown-formatting.js";

/**
 * Public rule-module shape used for individually exported FormSpec ESLint rules.
 *
 * @public
 */
export type NamedRuleModule<MessageIds extends string, Options extends readonly unknown[]> =
  TSESLint.RuleModule<MessageIds, Options> & { name: string };

export type {
  AllowedFieldTypesMessageIds,
  AllowedFieldTypesOptions,
  AllowedLayoutsMessageIds,
  AllowedLayoutsOptions,
  NoContradictionsMessageIds,
  NoDisabledTagsMessageIds,
  NoDisabledTagsOptions,
  NoMarkdownFormattingMessageIds,
  NoMarkdownFormattingOptions,
};

/**
 * Reports contradictory FormSpec constraint combinations.
 *
 * @public
 */
export const noContradictions: NamedRuleModule<NoContradictionsMessageIds, []> =
  noContradictionsRule;

/**
 * Reports FormSpec tags disabled by project configuration.
 *
 * @public
 */
export const noDisabledTags: NamedRuleModule<NoDisabledTagsMessageIds, NoDisabledTagsOptions> =
  noDisabledTagsRule;

/**
 * Forbids Markdown formatting in configured FormSpec tag values.
 *
 * @public
 */
export const noMarkdownFormatting: NamedRuleModule<
  NoMarkdownFormattingMessageIds,
  NoMarkdownFormattingOptions
> = noMarkdownFormattingRule;

/**
 * Validates allowed field types against project constraints.
 *
 * @public
 */
export const allowedFieldTypes: NamedRuleModule<
  AllowedFieldTypesMessageIds,
  AllowedFieldTypesOptions
> = allowedFieldTypesRule;

/**
 * Validates allowed layout constructs against project constraints.
 *
 * @public
 */
export const allowedLayouts: NamedRuleModule<AllowedLayoutsMessageIds, AllowedLayoutsOptions> =
  allowedLayoutsRule;

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
 *
 * @public
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
 *
 * @public
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
  validNumericValue,
  validIntegerValue,
  validRegexPattern,
  validJsonValue,
  tagTypeCheck,
  validPathTarget,
  validMemberTarget,
  noUnsupportedTargeting,
  noMemberTargetOnObject,
  noDuplicateTags,
  noDescriptionTag,
  noContradictoryRules,
};
