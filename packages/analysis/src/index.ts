export {
  parseCommentBlock,
  parseTagSyntax,
  sliceCommentSpan,
} from "./comment-syntax.js";
export type {
  CommentSpan,
  ParseCommentSyntaxOptions,
  ParsedCommentBlock,
  ParsedCommentTag,
  ParsedCommentTargetSpecifier,
} from "./comment-syntax.js";
export type {
  CommentCompletionContext,
  CommentCursorTarget,
  EnclosingDocComment,
} from "./cursor-context.js";
export {
  findCommentTagAtOffset,
  findEnclosingDocComment,
  getCommentCompletionContextAtOffset,
  getCommentCursorTargetAtOffset,
  getTagCompletionPrefixAtOffset,
} from "./cursor-context.js";
export type {
  ConstraintTagParseRegistryLike,
  ParseConstraintTagValueOptions,
} from "./tag-value-parser.js";
export {
  parseConstraintTagValue,
  parseDefaultValueTagValue,
} from "./tag-value-parser.js";
export {
  extractPathTarget,
  formatPathTarget,
  type ParsedPathTarget,
} from "./path-target.js";
export type {
  AnalysisTypeDefinition,
  AnalysisTypeRegistry,
  ConstraintRegistryLike,
  ConstraintSemanticDiagnostic,
  ConstraintTagRegistrationLike,
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
  ExtensionTagSource,
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
  type FormSpecPlacement,
  type FormSpecSemanticCapability,
} from "./ts-binding.js";
