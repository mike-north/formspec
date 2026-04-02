export type {
  FormSpecAnalysisCommentSnapshot,
  FormSpecAnalysisDiagnosticCategory,
  FormSpecAnalysisDiagnosticDataValue,
  FormSpecAnalysisDiagnosticLocation,
  FormSpecAnalysisDiagnostic,
  FormSpecAnalysisFileSnapshot,
  FormSpecAnalysisTagSnapshot,
  FormSpecSerializedCommentTargetSpecifier,
  FormSpecSerializedCompletionContext,
  FormSpecSerializedHoverInfo,
  FormSpecSerializedTagDefinition,
  FormSpecSerializedTagSemanticContext,
  FormSpecSerializedTagSignature,
} from "./semantic-protocol.js";
export type {
  CommentSourceSpan,
  CommentSpan,
} from "./comment-syntax.js";
export type { CommentHoverInfo } from "./cursor-context.js";
export type { FormSpecPlacement, FormSpecTargetKind } from "./tag-registry.js";
export {
  FORMSPEC_ANALYSIS_PROTOCOL_VERSION,
  FORMSPEC_ANALYSIS_SCHEMA_VERSION,
  computeFormSpecTextHash,
} from "./semantic-protocol.js";
