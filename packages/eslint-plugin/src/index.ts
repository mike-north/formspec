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
export { analyzeMetadataForNode, analyzeMetadataForSourceFile } from "@formspec/analysis";
export type {
  AnalyzeMetadataOptions,
  AnalyzeMetadataForNodeOptions,
  AnalyzeMetadataForSourceFileOptions,
} from "@formspec/analysis";
export type {
  ExplicitMetadataSource,
  ExplicitMetadataSourceForm,
  MetadataDeclarationKind,
  MetadataInferenceContext,
  MetadataQualifierRegistration,
  MetadataAnalysisResult,
  MetadataApplicableSlot,
  MetadataResolvedEntry,
  MetadataSlotRegistration,
  MetadataSlotId,
  MetadataSlotInferenceFn,
  MetadataSource,
  MetadataSourceSpan,
  ResolvedMetadata,
} from "@formspec/core";
import packageJson from "../package.json" with { type: "json" };
import type { FormSpecConfig } from "@formspec/config";
export type { DSLPolicy, FormSpecConfig, FormSpecPackageOverride } from "@formspec/config";
import { createExtensionRegistry } from "@formspec/build";
import {
  noUnknownTags,
  requireTagArguments,
  validNumericValue,
  validIntegerValue,
  validRegexPattern,
  validJsonValue,
  tagTypeCheck,
  noAnonymousRecursiveType,
  validPathTarget,
  validMemberTarget,
  noUnsupportedTargeting,
  noMemberTargetOnObject,
  validTargetVariant,
  noDuplicateTags,
  noUnsupportedDescriptionTag as noUnsupportedDescriptionTagRule,
  remarksWithoutSummary as remarksWithoutSummaryRule,
  noContradictoryRules,
  validDiscriminator,
  noDoubleUnderscoreFields,
  noDefaultOnRequiredField,
  allowedFieldTypes as allowedFieldTypesRule,
  allowedLayouts as allowedLayoutsRule,
  tsdocCommentSyntax as tsdocCommentSyntaxRule,
} from "./rules/index.js";
import {
  noContradictions as noContradictionsRule,
  type MessageIds as NoContradictionsMessageIds,
} from "./rules/constraint-validation/no-contradictions.js";
import type {
  AllowedFieldTypesConfig,
  MessageIds as AllowedFieldTypesMessageIds,
  Options as AllowedFieldTypesOptions,
} from "./rules/dsl-policy/allowed-field-types.js";
import type {
  AllowedLayoutsConfig,
  MessageIds as AllowedLayoutsMessageIds,
  Options as AllowedLayoutsOptions,
} from "./rules/dsl-policy/allowed-layouts.js";
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
export type NamedRuleModule<
  MessageIds extends string,
  Options extends readonly unknown[],
> = TSESLint.RuleModule<MessageIds, Options> & { name: string };

/**
 * Creates an ESLint-visible alias without mutating the canonical rule module.
 */
function createDeprecatedRuleAlias<MessageIds extends string, Options extends readonly unknown[]>(
  rule: NamedRuleModule<MessageIds, Options>,
  name: string,
  replacedBy: string
): NamedRuleModule<MessageIds, Options> {
  return {
    ...rule,
    name,
    meta: {
      ...rule.meta,
      deprecated: true,
      replacedBy: [replacedBy],
    },
  };
}

export type {
  AllowedFieldTypesMessageIds,
  AllowedFieldTypesOptions,
  AllowedFieldTypesConfig,
  AllowedLayoutsMessageIds,
  AllowedLayoutsOptions,
  AllowedLayoutsConfig,
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
 * Validates TSDoc comment syntax using FormSpec's TSDoc configuration,
 * suppressing false positives on raw-text FormSpec tag payloads.
 *
 * Use this rule in place of `tsdoc/syntax` from `eslint-plugin-tsdoc` for
 * FormSpec-annotated files.
 *
 * @public
 */
export const tsdocCommentSyntax: NamedRuleModule<"tsdocSyntax", []> = tsdocCommentSyntaxRule;

/**
 * Bans `@description`, which is not a supported FormSpec documentation tag.
 *
 * @public
 */
export const noUnsupportedDescriptionTag: NamedRuleModule<"descriptionTagForbidden", []> =
  noUnsupportedDescriptionTagRule;

/**
 * Warns when `@remarks` appears without summary text.
 *
 * @public
 */
export const remarksWithoutSummary: NamedRuleModule<"remarksWithoutSummary", []> =
  remarksWithoutSummaryRule;

const deprecatedNoDescriptionTag = createDeprecatedRuleAlias(
  noUnsupportedDescriptionTag,
  "constraint-validation/no-description-tag",
  "documentation/no-unsupported-description-tag"
);

/**
 * Deprecated alias for `documentation/no-unsupported-description-tag`.
 *
 * @deprecated Use `noUnsupportedDescriptionTag`.
 * @public
 */
export const noDescriptionTag: NamedRuleModule<"descriptionTagForbidden", []> =
  deprecatedNoDescriptionTag;

/**
 * Validates allowed field types against project DSL policy.
 *
 * @public
 */
export const allowedFieldTypes: NamedRuleModule<
  AllowedFieldTypesMessageIds,
  AllowedFieldTypesOptions
> = allowedFieldTypesRule;

/**
 * Validates allowed layout constructs against project DSL policy.
 *
 * @public
 */
export const allowedLayouts: NamedRuleModule<AllowedLayoutsMessageIds, AllowedLayoutsOptions> =
  allowedLayoutsRule;

const deprecatedAllowedFieldTypes = createDeprecatedRuleAlias(
  allowedFieldTypes,
  "constraints-allowed-field-types",
  "dsl-policy/allowed-field-types"
);

const deprecatedAllowedLayouts = createDeprecatedRuleAlias(
  allowedLayouts,
  "constraints-allowed-layouts",
  "dsl-policy/allowed-layouts"
);

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
  "tag-recognition/tsdoc-comment-syntax": tsdocCommentSyntax,
  "value-parsing/valid-numeric-value": validNumericValue,
  "value-parsing/valid-integer-value": validIntegerValue,
  "value-parsing/valid-regex-pattern": validRegexPattern,
  "value-parsing/valid-json-value": validJsonValue,
  "type-compatibility/tag-type-check": tagTypeCheck,
  "type-compatibility/no-anonymous-recursive-type": noAnonymousRecursiveType,
  "target-resolution/valid-path-target": validPathTarget,
  "target-resolution/valid-member-target": validMemberTarget,
  "target-resolution/no-unsupported-targeting": noUnsupportedTargeting,
  "target-resolution/no-member-target-on-object": noMemberTargetOnObject,
  "target-resolution/valid-target-variant": validTargetVariant,
  "constraint-validation/no-contradictions": noContradictions,
  "constraint-validation/no-duplicate-tags": noDuplicateTags,
  "constraint-validation/no-contradictory-rules": noContradictoryRules,
  "constraint-validation/valid-discriminator": validDiscriminator,
  "constraint-validation/no-double-underscore-fields": noDoubleUnderscoreFields,
  "constraint-validation/no-default-on-required-field": noDefaultOnRequiredField,
  "documentation/no-unsupported-description-tag": noUnsupportedDescriptionTag,
  "documentation/remarks-without-summary": remarksWithoutSummary,
  "dsl-policy/allowed-field-types": allowedFieldTypes,
  "dsl-policy/allowed-layouts": allowedLayouts,

  // Deprecated aliases retained for existing ESLint configs.
  "constraint-validation/no-description-tag": deprecatedNoDescriptionTag,
  "constraints-allowed-field-types": deprecatedAllowedFieldTypes,
  "constraints-allowed-layouts": deprecatedAllowedLayouts,
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
      "formspec/tag-recognition/no-markdown-formatting": "warn",
      "formspec/tag-recognition/tsdoc-comment-syntax": "error",
      "formspec/value-parsing/valid-numeric-value": "error",
      "formspec/value-parsing/valid-integer-value": "error",
      "formspec/value-parsing/valid-regex-pattern": "error",
      "formspec/value-parsing/valid-json-value": "error",
      "formspec/type-compatibility/tag-type-check": "error",
      "formspec/type-compatibility/no-anonymous-recursive-type": "error",
      "formspec/target-resolution/valid-path-target": "error",
      "formspec/target-resolution/valid-member-target": "error",
      "formspec/target-resolution/no-unsupported-targeting": "error",
      "formspec/target-resolution/no-member-target-on-object": "error",
      "formspec/target-resolution/valid-target-variant": "error",
      "formspec/constraint-validation/no-contradictions": "error",
      "formspec/constraint-validation/no-duplicate-tags": "warn",
      "formspec/constraint-validation/no-contradictory-rules": "error",
      "formspec/constraint-validation/valid-discriminator": "error",
      "formspec/constraint-validation/no-double-underscore-fields": "warn",
      "formspec/constraint-validation/no-default-on-required-field": "error",
      "formspec/documentation/no-unsupported-description-tag": "error",
      "formspec/documentation/remarks-without-summary": "warn",
      "formspec/dsl-policy/allowed-field-types": "error",
      "formspec/dsl-policy/allowed-layouts": "error",
    },
  },
];

/**
 * Strict configuration - configurable warnings are upgraded to errors, while
 * FormSpec info diagnostics remain ESLint warnings.
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
      "formspec/tag-recognition/no-markdown-formatting": "error",
      "formspec/tag-recognition/tsdoc-comment-syntax": "error",
      "formspec/value-parsing/valid-numeric-value": "error",
      "formspec/value-parsing/valid-integer-value": "error",
      "formspec/value-parsing/valid-regex-pattern": "error",
      "formspec/value-parsing/valid-json-value": "error",
      "formspec/type-compatibility/tag-type-check": "error",
      "formspec/type-compatibility/no-anonymous-recursive-type": "error",
      "formspec/target-resolution/valid-path-target": "error",
      "formspec/target-resolution/valid-member-target": "error",
      "formspec/target-resolution/no-unsupported-targeting": "error",
      "formspec/target-resolution/no-member-target-on-object": "error",
      "formspec/target-resolution/valid-target-variant": "error",
      "formspec/constraint-validation/no-contradictions": "error",
      "formspec/constraint-validation/no-duplicate-tags": "error",
      "formspec/constraint-validation/no-contradictory-rules": "error",
      "formspec/constraint-validation/valid-discriminator": "error",
      "formspec/constraint-validation/no-double-underscore-fields": "error",
      "formspec/constraint-validation/no-default-on-required-field": "error",
      "formspec/documentation/no-unsupported-description-tag": "error",
      "formspec/documentation/remarks-without-summary": "warn",
      "formspec/dsl-policy/allowed-field-types": "error",
      "formspec/dsl-policy/allowed-layouts": "error",
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
  withConfig,
};

/**
 * Creates a configured version of the plugin with an extension registry
 * derived from the provided FormSpec configuration.
 *
 * The registry is injected into `settings.formspec.extensionRegistry` so
 * that rules like `tag-type-check` can consult it for builtin constraint
 * broadenings registered by extensions.
 *
 * @example
 * ```javascript
 * import formspec from "@formspec/eslint-plugin";
 * import myConfig from "./formspec.config.js";
 *
 * export default [
 *   ...formspec.withConfig(myConfig).configs.recommended,
 * ];
 * ```
 *
 * @public
 */
export function withConfig(config: FormSpecConfig): typeof plugin {
  const registry = createExtensionRegistry(config.extensions ?? []);
  const configWithSettings = (
    baseConfigs: TSESLint.FlatConfig.ConfigArray
  ): TSESLint.FlatConfig.ConfigArray =>
    baseConfigs.map((entry) => ({
      ...entry,
      settings: {
        ...entry.settings,
        formspec: {
          ...(entry.settings?.["formspec"] as Record<string, unknown> | undefined),
          extensionRegistry: registry,
        },
      },
    }));

  return {
    meta,
    rules,
    configs: {
      recommended: configWithSettings(recommendedConfig),
      strict: configWithSettings(strictConfig),
    },
    withConfig,
  };
}

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
  noAnonymousRecursiveType,
  validPathTarget,
  validMemberTarget,
  noUnsupportedTargeting,
  noMemberTargetOnObject,
  validTargetVariant,
  noDuplicateTags,
  noContradictoryRules,
  noDoubleUnderscoreFields,
  noDefaultOnRequiredField,
};
