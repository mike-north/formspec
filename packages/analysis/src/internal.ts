export {
  extractCommentSummaryText,
  parseCommentBlock,
  parseTagSyntax,
  sliceCommentSpan,
} from "./comment-syntax.js";
export type {
  CommentSourceSpan,
  CommentSpan,
  ParseCommentSyntaxOptions,
  ParsedCommentBlock,
  ParsedCommentTag,
  ParsedCommentTargetSpecifier,
} from "./comment-syntax.js";
export type {
  CommentHoverInfo,
  CommentCompletionContext,
  CommentCursorTarget,
  CommentSemanticContextOptions,
  CommentTagSemanticContext,
  EnclosingDocComment,
  SemanticCommentCompletionContext,
} from "./cursor-context.js";
export {
  findCommentTagAtOffset,
  findEnclosingDocComment,
  getCommentCompletionContextAtOffset,
  getCommentHoverInfoAtOffset,
  getCommentCursorTargetAtOffset,
  getCommentTagSemanticContext,
  getSemanticCommentCompletionContextAtOffset,
  getTagCompletionPrefixAtOffset,
} from "./cursor-context.js";
export type {
  ConstraintTagParseRegistryLike,
  ParseConstraintTagValueOptions,
} from "./tag-value-parser.js";
export {
  parseConstraintTagValue,
  parseDefaultValueTagValue,
  getBroadenedCustomTypeId,
} from "./tag-value-parser.js";
export { extractPathTarget, formatPathTarget, type ParsedPathTarget } from "./path-target.js";
export type {
  AnalysisTypeDefinition,
  AnalysisTypeRegistry,
  ConstraintRegistrationLike,
  ConstraintRegistryLike,
  ConstraintSemanticRoleLike,
  ConstraintSemanticDiagnostic,
  ConstraintTagRegistrationLike,
  ConstraintTargetAnalysisResult,
  EffectiveTargetState,
  ResolvedTargetState,
} from "./semantic-targets.js";
export {
  analyzeConstraintTargets,
  buildConstraintTargetStates,
  collectReferencedTypeAnnotations,
  collectReferencedTypeConstraints,
  dereferenceAnalysisType,
  formatConstraintTargetName,
  resolveConstraintTargetState,
} from "./semantic-targets.js";
export type {
  ExtensionConstraintTagSource,
  ExtensionCustomTypeSource,
  ExtensionTagSource,
  FormSpecPlacement,
  FormSpecTagCategory,
  FormSpecTagDefinition,
  FormSpecTagOverload,
  FormSpecTagParameter,
  FormSpecTargetKind,
  FormSpecValueKind,
  SemanticCapability,
  TagDefinition,
  TagSignature,
  TagSignatureParameter,
} from "./tag-registry.js";
export {
  FORM_SPEC_PLACEMENTS,
  FORM_SPEC_TARGET_KINDS,
  getAllTagDefinitions,
  getConstraintTagDefinitions,
  getTagDefinition,
  getTagHoverMarkdown,
  normalizeFormSpecTagName,
} from "./tag-registry.js";
export {
  getFormSpecManifestPath,
  getFormSpecWorkspaceId,
  getFormSpecWorkspaceRuntimeDirectory,
} from "./workspace-runtime.js";
export {
  buildFormSpecAnalysisFileSnapshot,
  type BuildFormSpecAnalysisFileSnapshotOptions,
} from "./file-snapshots.js";
export type {
  FormSpecPerformanceDetailValue,
  FormSpecPerformanceEvent,
  FormSpecPerformanceRecorder,
} from "./perf-tracing.js";
export {
  createFormSpecPerformanceRecorder,
  getFormSpecPerformanceNow,
  optionalMeasure,
  NOOP_FORMSPEC_PERFORMANCE_RECORDER,
} from "./perf-tracing.js";
export {
  findDeclarationForCommentOffset,
  getHostType,
  getLastLeadingDocCommentRange,
  getSubjectType,
} from "./source-bindings.js";
export * from "./protocol.js";
export {
  serializeCommentTagSemanticContext,
  serializeCommentTargetSpecifier,
  serializeCompletionContext,
  serializeHoverInfo,
  serializeParsedCommentTag,
} from "./semantic-protocol.js";
export {
  analyzeMetadataForNode,
  analyzeMetadataForSourceFile,
  analyzeMetadataForNodeWithChecker,
} from "./metadata-analysis.js";
export type {
  AnalyzeMetadataOptions,
  AnalyzeMetadataForNodeOptions,
  AnalyzeMetadataForSourceFileOptions,
  AnalyzeMetadataWithCheckerOptions,
} from "./metadata-analysis.js";
export {
  collectInheritedTypeAnnotations,
  extractNamedTypeAnnotations,
  hasInheritableTypeAnnotation,
} from "./heritage-annotations.js";
export type { HeritageAnnotationExtractor } from "./heritage-annotations.js";
export {
  collectCompatiblePathTargets,
  getEnumMemberCompletions,
  getTypeSemanticCapabilities,
  hasTypeSemanticCapability,
  resolveDeclarationPlacement,
  resolvePathTargetType,
  stripNullishUnion,
  type FormSpecSemanticCapability,
  type ResolvedPathTargetType,
} from "./ts-binding.js";
export { TAGS_REQUIRING_RAW_TEXT, getOrCreateTSDocParser } from "./tsdoc-config.js";
export { choosePreferredPayloadText } from "./tsdoc-text-extraction.js";
// Extension setup validation (used by the file-snapshot entry path and the
// build path's extension registry).
export {
  _emitSetupDiagnostics,
  _mapSetupDiagnosticCode,
  _validateExtensionSetup,
} from "./extension-setup-validation.js";
export type { SetupDiagnostic } from "./extension-setup-validation.js";

// Role-A placement pre-check, shared between the build and snapshot consumers.
export { getMatchingTagSignatures } from "./tag-signature-matching.js";
export type { TagTargetKind } from "./tag-signature-matching.js";
export {
  parseUnifiedComment,
  type UnifiedParsedComment,
  type UnifiedParsedTag,
  type UnifiedParseOptions,
} from "./unified-comment-parser.js";
export {
  parseTagArgument,
  mapTypedParserDiagnosticCode,
  extractEffectiveArgumentText,
  TAG_ARGUMENT_DIAGNOSTIC_CODES,
  type MappedTypedParserCode,
  type TagArgumentValue,
  type TagArgumentParseResult,
  type TagArgumentDiagnostic,
  type TagArgumentDiagnosticCode,
  type TagArgumentLowering,
} from "./tag-argument-parser.js";
export { _isIntegerBrandedType, _collectBrandIdentifiers } from "./integer-brand.js";
export {
  _capabilityLabel,
  _supportsConstraintCapability,
  _checkConstValueAgainstType,
} from "./constraint-applicability.js";
export {
  CONSTRAINT_VALIDATOR_NS,
  CONSTRAINT_VALIDATOR_BUILD_NS,
  CONSTRAINT_VALIDATOR_SNAPSHOT_NS,
  CONSTRAINT_VALIDATOR_TYPED_PARSER_NS,
  CONSTRAINT_VALIDATOR_REGISTRY_NS,
  CONSTRAINT_VALIDATOR_BROADENING_NS,
  getBuildLogger,
  getSnapshotLogger,
  getRegistryLogger,
  getTypedParserLogger,
  getBroadeningLogger,
  nowMicros,
  elapsedMicros,
  describeTypeKind,
  logTagApplication,
  logSetupDiagnostics,
  type ConstraintValidatorConsumer,
  type ConstraintValidatorRoleOutcome,
  type ConstraintTagApplicationLogEntry,
  type SetupDiagnosticLogEntry,
} from "./constraint-validator-logger.js";
