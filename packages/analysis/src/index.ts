export { parseCommentBlock, parseTagSyntax, sliceCommentSpan } from "./comment-syntax.js";
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
  getSemanticCommentCompletionContextAtOffset,
  getTagCompletionPrefixAtOffset,
} from "./cursor-context.js";
export type {
  ConstraintTagParseRegistryLike,
  ParseConstraintTagValueOptions,
} from "./tag-value-parser.js";
export { parseConstraintTagValue, parseDefaultValueTagValue } from "./tag-value-parser.js";
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
  getAllTagDefinitions,
  getConstraintTagDefinitions,
  getTagDefinition,
  getTagHoverMarkdown,
  normalizeFormSpecTagName,
} from "./tag-registry.js";
export {
  collectCompatiblePathTargets,
  getTypeSemanticCapabilities,
  hasTypeSemanticCapability,
  resolveDeclarationPlacement,
  resolvePathTargetType,
  type FormSpecSemanticCapability,
  type ResolvedPathTargetType,
} from "./ts-binding.js";
export type {
  CheckSyntheticTagApplicationOptions,
  LowerSyntheticTagApplicationOptions,
  LoweredSyntheticTagApplication,
  SyntheticCompilerDiagnostic,
  SyntheticTagCheckResult,
  SyntheticTagTargetKind,
  SyntheticTagTargetSpecifier,
} from "./compiler-signatures.js";
export {
  buildSyntheticHelperPrelude,
  checkSyntheticTagApplication,
  getMatchingTagSignatures,
  lowerTagApplicationToSyntheticCall,
} from "./compiler-signatures.js";
