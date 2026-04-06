/**
 * \@formspec/eslint-plugin/base
 *
 * Rule infrastructure for extension authors who want to create their own
 * FormSpec-aware ESLint rules or custom constraint tag validators.
 *
 * @example
 * ```typescript
 * import { createConstraintRule } from "@formspec/eslint-plugin/base";
 *
 * export const maxSigFigRule = createConstraintRule({
 *   tagName: "MaxSigFig",
 *   applicableTypes: ["number"],
 *   validateValue: (value) => {
 *     const n = Number(value);
 *     if (Number.isNaN(n)) return `Value must be numeric, got "${value}"`;
 *     if (n < 1) return `@MaxSigFig must be at least 1, got ${String(n)}`;
 *     return null;
 *   },
 * });
 * ```
 */

// Factory for building custom constraint tag rules
export { createConstraintRule } from "./factories/constraint-rule.js";
export type { ConstraintRuleOptions } from "./factories/constraint-rule.js";

// JSDoc parsing utilities — extension authors can reuse these for custom rules
export {
  getJSDocConstraints,
  findJSDocConstraint,
  getArbitraryJSDocTag,
} from "./utils/jsdoc-utils.js";
export type { JSDocConstraint, RawJSDocTag } from "./utils/jsdoc-utils.js";

// Shared metadata-analysis helpers for downstream rule authors
export {
  analyzeMetadataForNode,
  analyzeMetadataForSourceFile,
} from "@formspec/analysis";
export type {
  AnalyzeMetadataOptions,
  AnalyzeMetadataForNodeOptions,
  AnalyzeMetadataForSourceFileOptions,
} from "@formspec/analysis";
export type {
  ExplicitMetadataSource,
  MetadataAnalysisResult,
  MetadataApplicableSlot,
  MetadataResolvedEntry,
  MetadataSlotRegistration,
  MetadataSourceSpan,
} from "@formspec/core";

// Type utilities — expose the helpers that power type-compatibility rules
export {
  getFieldTypeCategory,
  getPropertyType,
  isStringType,
  isNumberType,
  isBigIntType,
  isBooleanType,
  isArrayType,
} from "./utils/type-utils.js";
export type { FieldTypeCategory } from "./utils/type-utils.js";
