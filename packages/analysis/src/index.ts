/**
 * @packageDocumentation
 *
 * Public analysis protocol types and runtime helpers for FormSpec tooling.
 */
export * from "./protocol.js";
export { analyzeMetadataForNode, analyzeMetadataForSourceFile } from "./metadata-analysis.js";
export type {
  AnalyzeMetadataOptions,
  AnalyzeMetadataForNodeOptions,
  AnalyzeMetadataForSourceFileOptions,
} from "./metadata-analysis.js";
// @internal exports — excluded from the public API report by api-extractor.
// These are shared utilities for cross-consumer parity in the build and
// snapshot constraint-validation paths (synthetic-checker retirement §4).
export { isIntegerBrandedType } from "./integer-brand.js";
export { extractEffectiveArgumentText } from "./tag-argument-parser.js";
