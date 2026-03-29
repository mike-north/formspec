import type {
  CommentSpan,
  ParsedCommentTag,
  ParsedCommentTargetSpecifier,
} from "./comment-syntax.js";
import type {
  CommentHoverInfo,
  CommentTagSemanticContext,
  SemanticCommentCompletionContext,
} from "./cursor-context.js";
import type { FormSpecPlacement, FormSpecTargetKind } from "./tag-registry.js";

export const FORMSPEC_ANALYSIS_PROTOCOL_VERSION = 1;
export const FORMSPEC_ANALYSIS_SCHEMA_VERSION = 1;

/**
 * Cross-process endpoint used by the language server to reach the semantic
 * tsserver plugin on the current workspace host.
 */
export interface FormSpecIpcEndpoint {
  readonly kind: "unix-socket" | "windows-pipe";
  readonly address: string;
}

/**
 * Discovery record written by the tsserver plugin so other FormSpec tooling
 * can locate and validate the matching semantic service for a workspace.
 */
export interface FormSpecAnalysisManifest {
  readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
  readonly analysisSchemaVersion: typeof FORMSPEC_ANALYSIS_SCHEMA_VERSION;
  readonly workspaceRoot: string;
  readonly workspaceId: string;
  readonly endpoint: FormSpecIpcEndpoint;
  readonly typescriptVersion: string;
  readonly extensionFingerprint: string;
  readonly generation: number;
  readonly updatedAt: string;
}

/**
 * Serializable subset of tag metadata needed by hover and completion UIs.
 */
export interface FormSpecSerializedTagDefinition {
  readonly canonicalName: string;
  readonly completionDetail: string;
  readonly hoverMarkdown: string;
}

/**
 * Serializable overload/signature summary for one comment tag form.
 */
export interface FormSpecSerializedTagSignature {
  readonly label: string;
  readonly placements: readonly FormSpecPlacement[];
}

/**
 * Serialized representation of a parsed target specifier with exact spans.
 */
export interface FormSpecSerializedCommentTargetSpecifier {
  readonly rawText: string;
  readonly valid: boolean;
  readonly kind: ParsedCommentTargetSpecifier["kind"];
  readonly fullSpan: CommentSpan;
  readonly colonSpan: CommentSpan;
  readonly span: CommentSpan;
}

/**
 * Semantic facts about one parsed tag, reduced to JSON-safe data for IPC.
 */
export interface FormSpecSerializedTagSemanticContext {
  readonly tagName: string;
  readonly tagDefinition: FormSpecSerializedTagDefinition | null;
  readonly placement: FormSpecPlacement | null;
  readonly supportedTargets: readonly FormSpecTargetKind[];
  readonly targetCompletions: readonly string[];
  readonly compatiblePathTargets: readonly string[];
  readonly valueLabels: readonly string[];
  readonly signatures: readonly FormSpecSerializedTagSignature[];
  readonly tagHoverMarkdown: string | null;
  readonly targetHoverMarkdown: string | null;
  readonly argumentHoverMarkdown: string | null;
}

/**
 * Cursor-scoped completion context serialized for transport between the
 * semantic tsserver plugin and the lightweight LSP.
 */
export type FormSpecSerializedCompletionContext =
  | {
      readonly kind: "tag-name";
      readonly prefix: string;
      readonly availableTags: readonly FormSpecSerializedTagDefinition[];
    }
  | {
      readonly kind: "target";
      readonly semantic: FormSpecSerializedTagSemanticContext;
    }
  | {
      readonly kind: "argument";
      readonly semantic: FormSpecSerializedTagSemanticContext;
      readonly valueLabels: readonly string[];
    }
  | {
      readonly kind: "none";
    };

/**
 * Hover payload for a single comment token under the cursor.
 */
export interface FormSpecSerializedHoverInfo {
  readonly kind: CommentHoverInfo["kind"];
  readonly markdown: string;
}

/**
 * File-local diagnostic derived from comment parsing or semantic analysis.
 */
export interface FormSpecAnalysisDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly range: CommentSpan;
  readonly severity: "error" | "warning" | "info";
}

/**
 * Serializable view of a single parsed FormSpec tag within a doc comment.
 */
export interface FormSpecAnalysisTagSnapshot {
  readonly rawTagName: string;
  readonly normalizedTagName: string;
  readonly recognized: boolean;
  readonly fullSpan: CommentSpan;
  readonly tagNameSpan: CommentSpan;
  readonly payloadSpan: CommentSpan | null;
  readonly target: FormSpecSerializedCommentTargetSpecifier | null;
  readonly argumentSpan: CommentSpan | null;
  readonly argumentText: string;
  readonly semantic: FormSpecSerializedTagSemanticContext;
}

/**
 * Serializable view of one declaration-attached doc comment in a source file.
 */
export interface FormSpecAnalysisCommentSnapshot {
  readonly commentSpan: CommentSpan;
  readonly declarationSpan: CommentSpan;
  readonly placement: FormSpecPlacement | null;
  readonly subjectType: string | null;
  readonly hostType: string | null;
  readonly tags: readonly FormSpecAnalysisTagSnapshot[];
}

/**
 * Serializable analysis artifact for a single source file.
 */
export interface FormSpecAnalysisFileSnapshot {
  readonly filePath: string;
  readonly sourceHash: string;
  readonly generatedAt: string;
  readonly comments: readonly FormSpecAnalysisCommentSnapshot[];
  readonly diagnostics: readonly FormSpecAnalysisDiagnostic[];
}

/**
 * Query variants supported by the semantic tsserver plugin.
 */
export type FormSpecSemanticQuery =
  | {
      readonly kind: "health";
    }
  | {
      readonly kind: "completion";
      readonly filePath: string;
      readonly offset: number;
    }
  | {
      readonly kind: "hover";
      readonly filePath: string;
      readonly offset: number;
    }
  | {
      readonly kind: "diagnostics";
      readonly filePath: string;
    }
  | {
      readonly kind: "file-snapshot";
      readonly filePath: string;
    };

/**
 * Response variants returned by the semantic tsserver plugin.
 */
export type FormSpecSemanticResponse =
  | {
      readonly kind: "health";
      readonly manifest: FormSpecAnalysisManifest;
    }
  | {
      readonly kind: "completion";
      readonly sourceHash: string;
      readonly context: FormSpecSerializedCompletionContext;
    }
  | {
      readonly kind: "hover";
      readonly sourceHash: string;
      readonly hover: FormSpecSerializedHoverInfo | null;
    }
  | {
      readonly kind: "diagnostics";
      readonly sourceHash: string;
      readonly diagnostics: readonly FormSpecAnalysisDiagnostic[];
    }
  | {
      readonly kind: "file-snapshot";
      readonly snapshot: FormSpecAnalysisFileSnapshot | null;
    }
  | {
      readonly kind: "error";
      readonly error: string;
    };

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCommentSpan(value: unknown): value is CommentSpan {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<CommentSpan>;
  return typeof candidate.start === "number" && typeof candidate.end === "number";
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isPlacementArray(value: unknown): value is readonly FormSpecPlacement[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isTargetKindArray(value: unknown): value is readonly FormSpecTargetKind[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isIpcEndpoint(value: unknown): value is FormSpecIpcEndpoint {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecIpcEndpoint>;
  return (
    (candidate.kind === "unix-socket" || candidate.kind === "windows-pipe") &&
    typeof candidate.address === "string"
  );
}

function isSerializedTagDefinition(value: unknown): value is FormSpecSerializedTagDefinition {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecSerializedTagDefinition>;
  return (
    typeof candidate.canonicalName === "string" &&
    typeof candidate.completionDetail === "string" &&
    typeof candidate.hoverMarkdown === "string"
  );
}

function isSerializedTagSignature(value: unknown): value is FormSpecSerializedTagSignature {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecSerializedTagSignature>;
  return typeof candidate.label === "string" && isPlacementArray(candidate.placements);
}

function isSerializedCommentTargetSpecifier(
  value: unknown
): value is FormSpecSerializedCommentTargetSpecifier {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecSerializedCommentTargetSpecifier>;
  return (
    typeof candidate.rawText === "string" &&
    typeof candidate.valid === "boolean" &&
    typeof candidate.kind === "string" &&
    isCommentSpan(candidate.fullSpan) &&
    isCommentSpan(candidate.colonSpan) &&
    isCommentSpan(candidate.span)
  );
}

function isSerializedTagSemanticContext(
  value: unknown
): value is FormSpecSerializedTagSemanticContext {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecSerializedTagSemanticContext>;
  return (
    typeof candidate.tagName === "string" &&
    (candidate.tagDefinition === null || isSerializedTagDefinition(candidate.tagDefinition)) &&
    (candidate.placement === null || typeof candidate.placement === "string") &&
    isTargetKindArray(candidate.supportedTargets) &&
    isStringArray(candidate.targetCompletions) &&
    isStringArray(candidate.compatiblePathTargets) &&
    isStringArray(candidate.valueLabels) &&
    Array.isArray(candidate.signatures) &&
    candidate.signatures.every(isSerializedTagSignature) &&
    (candidate.tagHoverMarkdown === null || typeof candidate.tagHoverMarkdown === "string") &&
    (candidate.targetHoverMarkdown === null ||
      typeof candidate.targetHoverMarkdown === "string") &&
    (candidate.argumentHoverMarkdown === null ||
      typeof candidate.argumentHoverMarkdown === "string")
  );
}

function isSerializedCompletionContext(
  value: unknown
): value is FormSpecSerializedCompletionContext {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecSerializedCompletionContext>;
  if (typeof candidate.kind !== "string") {
    return false;
  }

  switch (candidate.kind) {
    case "tag-name":
      return typeof candidate.prefix === "string" && Array.isArray(candidate.availableTags)
        ? candidate.availableTags.every(isSerializedTagDefinition)
        : false;
    case "target":
      return isSerializedTagSemanticContext(candidate.semantic);
    case "argument":
      return (
        isSerializedTagSemanticContext(candidate.semantic) &&
        isStringArray(candidate.valueLabels)
      );
    case "none":
      return true;
    default:
      return false;
  }
}

function isSerializedHoverInfo(value: unknown): value is FormSpecSerializedHoverInfo {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecSerializedHoverInfo>;
  return (
    (candidate.kind === "tag-name" ||
      candidate.kind === "target" ||
      candidate.kind === "argument") &&
    typeof candidate.markdown === "string"
  );
}

function isAnalysisDiagnostic(value: unknown): value is FormSpecAnalysisDiagnostic {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecAnalysisDiagnostic>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    isCommentSpan(candidate.range) &&
    (candidate.severity === "error" ||
      candidate.severity === "warning" ||
      candidate.severity === "info")
  );
}

function isAnalysisTagSnapshot(value: unknown): value is FormSpecAnalysisTagSnapshot {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecAnalysisTagSnapshot>;
  return (
    typeof candidate.rawTagName === "string" &&
    typeof candidate.normalizedTagName === "string" &&
    typeof candidate.recognized === "boolean" &&
    isCommentSpan(candidate.fullSpan) &&
    isCommentSpan(candidate.tagNameSpan) &&
    (candidate.payloadSpan === null || isCommentSpan(candidate.payloadSpan)) &&
    (candidate.target === null || isSerializedCommentTargetSpecifier(candidate.target)) &&
    (candidate.argumentSpan === null || isCommentSpan(candidate.argumentSpan)) &&
    typeof candidate.argumentText === "string" &&
    isSerializedTagSemanticContext(candidate.semantic)
  );
}

function isAnalysisCommentSnapshot(value: unknown): value is FormSpecAnalysisCommentSnapshot {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecAnalysisCommentSnapshot>;
  return (
    isCommentSpan(candidate.commentSpan) &&
    isCommentSpan(candidate.declarationSpan) &&
    (candidate.placement === null || typeof candidate.placement === "string") &&
    (candidate.subjectType === null || typeof candidate.subjectType === "string") &&
    (candidate.hostType === null || typeof candidate.hostType === "string") &&
    Array.isArray(candidate.tags) &&
    candidate.tags.every(isAnalysisTagSnapshot)
  );
}

function isAnalysisFileSnapshot(value: unknown): value is FormSpecAnalysisFileSnapshot {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecAnalysisFileSnapshot>;
  return (
    typeof candidate.filePath === "string" &&
    typeof candidate.sourceHash === "string" &&
    typeof candidate.generatedAt === "string" &&
    Array.isArray(candidate.comments) &&
    candidate.comments.every(isAnalysisCommentSnapshot) &&
    Array.isArray(candidate.diagnostics) &&
    candidate.diagnostics.every(isAnalysisDiagnostic)
  );
}

/**
 * Validates an unknown manifest payload from disk before consumers trust it.
 */
export function isFormSpecAnalysisManifest(value: unknown): value is FormSpecAnalysisManifest {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecAnalysisManifest>;
  return (
    candidate.protocolVersion === FORMSPEC_ANALYSIS_PROTOCOL_VERSION &&
    candidate.analysisSchemaVersion === FORMSPEC_ANALYSIS_SCHEMA_VERSION &&
    typeof candidate.workspaceRoot === "string" &&
    typeof candidate.workspaceId === "string" &&
    isIpcEndpoint(candidate.endpoint) &&
    typeof candidate.typescriptVersion === "string" &&
    typeof candidate.extensionFingerprint === "string" &&
    typeof candidate.generation === "number" &&
    typeof candidate.updatedAt === "string"
  );
}

/**
 * Validates an unknown inbound IPC request before dispatching it.
 */
export function isFormSpecSemanticQuery(value: unknown): value is FormSpecSemanticQuery {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecSemanticQuery>;
  if (typeof candidate.kind !== "string") {
    return false;
  }

  switch (candidate.kind) {
    case "health":
      return true;
    case "completion":
    case "hover":
      return typeof candidate.filePath === "string" && typeof candidate.offset === "number";
    case "diagnostics":
    case "file-snapshot":
      return typeof candidate.filePath === "string";
    default:
      return false;
  }
}

/**
 * Validates an unknown IPC response before the language server consumes it.
 */
export function isFormSpecSemanticResponse(value: unknown): value is FormSpecSemanticResponse {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecSemanticResponse>;
  if (typeof candidate.kind !== "string") {
    return false;
  }

  switch (candidate.kind) {
    case "health":
      return isFormSpecAnalysisManifest(candidate.manifest);
    case "completion":
      return (
        typeof candidate.sourceHash === "string" &&
        isSerializedCompletionContext(candidate.context)
      );
    case "hover":
      return (
        typeof candidate.sourceHash === "string" &&
        (candidate.hover === null || isSerializedHoverInfo(candidate.hover))
      );
    case "diagnostics":
      return (
        typeof candidate.sourceHash === "string" &&
        Array.isArray(candidate.diagnostics) &&
        candidate.diagnostics.every(isAnalysisDiagnostic)
      );
    case "file-snapshot":
      return candidate.snapshot === null || isAnalysisFileSnapshot(candidate.snapshot);
    case "error":
      return typeof candidate.error === "string";
    default:
      return false;
  }
}

/**
 * Computes a stable, non-cryptographic hash for document staleness checks
 * across the plugin/LSP boundary.
 */
export function computeFormSpecTextHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Converts a parsed target specifier into its transport-safe JSON form.
 */
export function serializeCommentTargetSpecifier(
  target: ParsedCommentTargetSpecifier | null
): FormSpecSerializedCommentTargetSpecifier | null {
  if (target === null) {
    return null;
  }

  return {
    rawText: target.rawText,
    valid: target.valid,
    kind: target.kind,
    fullSpan: target.fullSpan,
    colonSpan: target.colonSpan,
    span: target.span,
  };
}

/**
 * Serializes tag-level semantic context for cross-process consumption.
 */
export function serializeCommentTagSemanticContext(
  semantic: CommentTagSemanticContext
): FormSpecSerializedTagSemanticContext {
  return {
    tagName: semantic.tag.normalizedTagName,
    tagDefinition:
      semantic.tagDefinition === null
        ? null
        : {
            canonicalName: semantic.tagDefinition.canonicalName,
            completionDetail: semantic.tagDefinition.completionDetail,
            hoverMarkdown: semantic.tagDefinition.hoverMarkdown,
          },
    placement: semantic.placement,
    supportedTargets: semantic.supportedTargets,
    targetCompletions: semantic.targetCompletions,
    compatiblePathTargets: semantic.compatiblePathTargets,
    valueLabels: semantic.valueLabels,
    signatures: semantic.signatures.map((signature) => ({
      label: signature.label,
      placements: signature.placements,
    })),
    tagHoverMarkdown: semantic.tagHoverMarkdown,
    targetHoverMarkdown: semantic.targetHoverMarkdown,
    argumentHoverMarkdown: semantic.argumentHoverMarkdown,
  };
}

/**
 * Serializes a cursor-scoped completion context for IPC.
 */
export function serializeCompletionContext(
  context: SemanticCommentCompletionContext
): FormSpecSerializedCompletionContext {
  switch (context.kind) {
    case "tag-name":
      return {
        kind: "tag-name",
        prefix: context.prefix,
        availableTags: context.availableTags.map((tag) => ({
          canonicalName: tag.canonicalName,
          completionDetail: tag.completionDetail,
          hoverMarkdown: tag.hoverMarkdown,
        })),
      };
    case "target":
      return {
        kind: "target",
        semantic: serializeCommentTagSemanticContext(context.semantic),
      };
    case "argument":
      return {
        kind: "argument",
        semantic: serializeCommentTagSemanticContext(context.semantic),
        valueLabels: context.valueLabels,
      };
    case "none":
      return { kind: "none" };
    default: {
      const exhaustive: never = context;
      return exhaustive;
    }
  }
}

/**
 * Serializes hover information for cross-process transport.
 */
export function serializeHoverInfo(
  hover: CommentHoverInfo | null
): FormSpecSerializedHoverInfo | null {
  return hover === null
    ? null
    : {
        kind: hover.kind,
        markdown: hover.markdown,
      };
}

/**
 * Serializes a parsed tag plus its semantic context into a file snapshot entry.
 */
export function serializeParsedCommentTag(
  tag: ParsedCommentTag,
  semantic: CommentTagSemanticContext
): FormSpecAnalysisTagSnapshot {
  return {
    rawTagName: tag.rawTagName,
    normalizedTagName: tag.normalizedTagName,
    recognized: tag.recognized,
    fullSpan: tag.fullSpan,
    tagNameSpan: tag.tagNameSpan,
    payloadSpan: tag.payloadSpan,
    target: serializeCommentTargetSpecifier(tag.target),
    argumentSpan: tag.argumentSpan,
    argumentText: tag.argumentText,
    semantic: serializeCommentTagSemanticContext(semantic),
  };
}
