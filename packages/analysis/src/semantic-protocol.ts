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
import {
  FORM_SPEC_PLACEMENTS,
  FORM_SPEC_TARGET_KINDS,
  type FormSpecPlacement,
  type FormSpecTargetKind,
} from "./tag-registry.js";

/**
 * Current semantic-query protocol version shared by FormSpec analysis clients
 * and servers.
 *
 * @public
 */
export const FORMSPEC_ANALYSIS_PROTOCOL_VERSION = 2;
/**
 * Current schema version for serialized analysis artifacts.
 *
 * @public
 */
export const FORMSPEC_ANALYSIS_SCHEMA_VERSION = 1;

/**
 * Cross-process endpoint used by the language server to reach the semantic
 * tsserver plugin on the current workspace host.
 *
 * @public
 */
export interface FormSpecIpcEndpoint {
  /** Transport kind used to connect to the workspace semantic service. */
  readonly kind: "unix-socket" | "windows-pipe";
  /** Absolute socket path or pipe name for the semantic service endpoint. */
  readonly address: string;
}

/**
 * Discovery record written by the tsserver plugin so other FormSpec tooling
 * can locate and validate the matching semantic service for a workspace.
 *
 * @public
 */
export interface FormSpecAnalysisManifest {
  /** Protocol version expected by both the client and semantic service. */
  readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
  /** Schema version for serialized analysis artifacts. */
  readonly analysisSchemaVersion: typeof FORMSPEC_ANALYSIS_SCHEMA_VERSION;
  /** Absolute workspace root the manifest was generated for. */
  readonly workspaceRoot: string;
  /** Stable identifier derived from the workspace root. */
  readonly workspaceId: string;
  /** IPC endpoint clients should connect to for semantic queries. */
  readonly endpoint: FormSpecIpcEndpoint;
  /** TypeScript version reported by the host environment. */
  readonly typescriptVersion: string;
  /** Fingerprint representing the active extension-tag registry. */
  readonly extensionFingerprint: string;
  /** Monotonic generation number for manifest refreshes. */
  readonly generation: number;
  /** ISO timestamp for when the manifest was last written. */
  readonly updatedAt: string;
}

/**
 * Serializable subset of tag metadata needed by hover and completion UIs.
 *
 * @public
 */
export interface FormSpecSerializedTagDefinition {
  /** Canonical tag name, including the `@` prefix. */
  readonly canonicalName: string;
  /** Short completion label shown in completion menus. */
  readonly completionDetail: string;
  /** Markdown hover content describing the tag. */
  readonly hoverMarkdown: string;
}

/**
 * Serializable overload/signature summary for one comment tag form.
 *
 * @public
 */
export interface FormSpecSerializedTagSignature {
  /** Human-readable rendering of one supported tag signature. */
  readonly label: string;
  /** Declaration placements where this signature is valid. */
  readonly placements: readonly FormSpecPlacement[];
}

/**
 * Serialized representation of a parsed target specifier with exact spans.
 *
 * @public
 */
export interface FormSpecSerializedCommentTargetSpecifier {
  /** Raw target text without the leading colon. */
  readonly rawText: string;
  /** Whether the serialized target parsed successfully. */
  readonly valid: boolean;
  /** Target syntax kind inferred for the serialized specifier. */
  readonly kind: "path" | "member" | "variant" | "ambiguous";
  /** Span covering the entire target, including the leading colon. */
  readonly fullSpan: CommentSpan;
  /** Span covering only the colon token. */
  readonly colonSpan: CommentSpan;
  /** Span covering only the target text. */
  readonly span: CommentSpan;
}

/**
 * Semantic facts about one parsed tag, reduced to JSON-safe data for IPC.
 *
 * @public
 */
export interface FormSpecSerializedTagSemanticContext {
  /** Canonical tag name, including the `@` prefix. */
  readonly tagName: string;
  /** Tag metadata when the tag is recognized by the registry. */
  readonly tagDefinition: FormSpecSerializedTagDefinition | null;
  /** Declaration placement the tag was evaluated in, if known. */
  readonly placement: FormSpecPlacement | null;
  /** Target syntaxes supported by the matching signatures. */
  readonly supportedTargets: readonly FormSpecTargetKind[];
  /** Suggested targets for completion UIs. */
  readonly targetCompletions: readonly string[];
  /** Compatible path targets computed from the subject type, if available. */
  readonly compatiblePathTargets: readonly string[];
  /** Suggested value labels derived from the matching signatures. */
  readonly valueLabels: readonly string[];
  /** Signature summaries for the recognized tag in the current placement. */
  readonly signatures: readonly FormSpecSerializedTagSignature[];
  /** Markdown hover for the tag name token. */
  readonly tagHoverMarkdown: string | null;
  /** Markdown hover for the target token, when available. */
  readonly targetHoverMarkdown: string | null;
  /** Markdown hover for the argument token, when available. */
  readonly argumentHoverMarkdown: string | null;
}

/**
 * Cursor-scoped completion context serialized for transport between the
 * semantic tsserver plugin and the lightweight LSP.
 *
 * @public
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
 *
 * @public
 */
export interface FormSpecSerializedHoverInfo {
  /** Comment token kind being described. */
  readonly kind: "tag-name" | "target" | "argument";
  /** Markdown payload that should be rendered for the hover. */
  readonly markdown: string;
}

/**
 * Machine-readable diagnostic category used by FormSpec tooling surfaces.
 *
 * @public
 */
export type FormSpecAnalysisDiagnosticCategory =
  | "tag-recognition"
  | "value-parsing"
  | "type-compatibility"
  | "target-resolution"
  | "constraint-validation"
  | "infrastructure";

/**
 * Primitive structured values carried in diagnostic facts for white-label
 * downstream rendering.
 *
 * @public
 */
export type FormSpecAnalysisDiagnosticDataValue =
  | string
  | number
  | boolean
  | readonly string[]
  | readonly number[]
  | readonly boolean[];

/**
 * Additional source location associated with a diagnostic.
 *
 * @public
 */
export interface FormSpecAnalysisDiagnosticLocation {
  /** Absolute file path for the related diagnostic location. */
  readonly filePath: string;
  /** Source range for the related diagnostic location. */
  readonly range: CommentSpan;
  /** Optional explanatory text for the related location. */
  readonly message?: string;
}

/**
 * File-local diagnostic derived from comment parsing or semantic analysis.
 *
 * @public
 */
export interface FormSpecAnalysisDiagnostic {
  /** Stable diagnostic code for downstream rendering or filtering. */
  readonly code: string;
  /** High-level diagnostic category. */
  readonly category: FormSpecAnalysisDiagnosticCategory;
  /** Human-readable diagnostic message. */
  readonly message: string;
  /** Source range where the diagnostic applies. */
  readonly range: CommentSpan;
  /** Severity to surface in editor or CLI UIs. */
  readonly severity: "error" | "warning" | "info";
  /** Additional source locations related to the diagnostic. */
  readonly relatedLocations: readonly FormSpecAnalysisDiagnosticLocation[];
  /** Structured diagnostic facts for white-label downstream formatting. */
  readonly data: Record<string, FormSpecAnalysisDiagnosticDataValue>;
}

/**
 * Serializable view of a single parsed FormSpec tag within a doc comment.
 *
 * @public
 */
export interface FormSpecAnalysisTagSnapshot {
  /** Raw tag name as written in the source comment. */
  readonly rawTagName: string;
  /** Canonicalized tag name used for registry lookup. */
  readonly normalizedTagName: string;
  /** Whether the tag matched a known FormSpec tag definition. */
  readonly recognized: boolean;
  /** Span covering the full tag payload on the source line. */
  readonly fullSpan: CommentSpan;
  /** Span covering only the tag-name token. */
  readonly tagNameSpan: CommentSpan;
  /** Span covering the payload after the tag name, if present. */
  readonly payloadSpan: CommentSpan | null;
  /** Parsed target specifier, if the tag includes one. */
  readonly target: FormSpecSerializedCommentTargetSpecifier | null;
  /** Span covering the argument token or payload segment, if present. */
  readonly argumentSpan: CommentSpan | null;
  /** Raw argument text after any target specifier. */
  readonly argumentText: string;
  /** Semantic context derived for the parsed tag. */
  readonly semantic: FormSpecSerializedTagSemanticContext;
}

/**
 * Serializable view of one declaration-attached doc comment in a source file.
 *
 * @public
 */
export interface FormSpecAnalysisCommentSnapshot {
  /** Span covering the full doc comment block. */
  readonly commentSpan: CommentSpan;
  /** Span covering the declaration that owns the comment. */
  readonly declarationSpan: CommentSpan;
  /** Normalized placement where the comment was found, if known. */
  readonly placement: FormSpecPlacement | null;
  /** String form of the subject type targeted by the comment, if known. */
  readonly subjectType: string | null;
  /** String form of the host declaration type, if known. */
  readonly hostType: string | null;
  /** Parsed tag snapshots found inside the comment. */
  readonly tags: readonly FormSpecAnalysisTagSnapshot[];
}

/**
 * Serializable analysis artifact for a single source file.
 *
 * @public
 */
export interface FormSpecAnalysisFileSnapshot {
  /** Absolute path of the analyzed source file. */
  readonly filePath: string;
  /** Stable hash of the file text used to detect drift. */
  readonly sourceHash: string;
  /** ISO timestamp recording when the snapshot was generated. */
  readonly generatedAt: string;
  /** Parsed comment snapshots extracted from the file. */
  readonly comments: readonly FormSpecAnalysisCommentSnapshot[];
  /** Diagnostics produced for the file at snapshot time. */
  readonly diagnostics: readonly FormSpecAnalysisDiagnostic[];
}

/**
 * Query variants supported by the semantic tsserver plugin.
 *
 * @public
 */
export type FormSpecSemanticQuery =
  | {
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      readonly kind: "health";
    }
  | {
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      readonly kind: "completion";
      readonly filePath: string;
      readonly offset: number;
    }
  | {
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      readonly kind: "hover";
      readonly filePath: string;
      readonly offset: number;
    }
  | {
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      readonly kind: "diagnostics";
      readonly filePath: string;
    }
  | {
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      readonly kind: "file-snapshot";
      readonly filePath: string;
    };

/**
 * Response variants returned by the semantic tsserver plugin.
 *
 * @public
 */
export type FormSpecSemanticResponse =
  | {
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      readonly kind: "health";
      readonly manifest: FormSpecAnalysisManifest;
    }
  | {
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      readonly kind: "completion";
      readonly sourceHash: string;
      readonly context: FormSpecSerializedCompletionContext;
    }
  | {
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      readonly kind: "hover";
      readonly sourceHash: string;
      readonly hover: FormSpecSerializedHoverInfo | null;
    }
  | {
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      readonly kind: "diagnostics";
      readonly sourceHash: string;
      readonly diagnostics: readonly FormSpecAnalysisDiagnostic[];
    }
  | {
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      readonly kind: "file-snapshot";
      readonly snapshot: FormSpecAnalysisFileSnapshot | null;
    }
  | {
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      readonly kind: "error";
      readonly error: string;
    };

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function isNumberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number");
}

function isBooleanArray(value: unknown): value is readonly boolean[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "boolean");
}

function isDiagnosticDataValue(value: unknown): value is FormSpecAnalysisDiagnosticDataValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    isStringArray(value) ||
    isNumberArray(value) ||
    isBooleanArray(value)
  );
}

function isDiagnosticDataRecord(
  value: unknown
): value is Record<string, FormSpecAnalysisDiagnosticDataValue> {
  return isObjectRecord(value) && Object.values(value).every(isDiagnosticDataValue);
}

const FORM_SPEC_PLACEMENT_VALUES = new Set<FormSpecPlacement>(FORM_SPEC_PLACEMENTS);

const FORM_SPEC_TARGET_KIND_VALUES = new Set<FormSpecTargetKind>(FORM_SPEC_TARGET_KINDS);

function isPlacementValue(value: unknown): value is FormSpecPlacement {
  return typeof value === "string" && FORM_SPEC_PLACEMENT_VALUES.has(value as FormSpecPlacement);
}

function isTargetKindValue(value: unknown): value is FormSpecTargetKind {
  return typeof value === "string" && FORM_SPEC_TARGET_KIND_VALUES.has(value as FormSpecTargetKind);
}

function isPlacementArray(value: unknown): value is readonly FormSpecPlacement[] {
  return Array.isArray(value) && value.every(isPlacementValue);
}

function isTargetKindArray(value: unknown): value is readonly FormSpecTargetKind[] {
  return Array.isArray(value) && value.every(isTargetKindValue);
}

function isDiagnosticCategory(value: unknown): value is FormSpecAnalysisDiagnosticCategory {
  return (
    value === "tag-recognition" ||
    value === "value-parsing" ||
    value === "type-compatibility" ||
    value === "target-resolution" ||
    value === "constraint-validation" ||
    value === "infrastructure"
  );
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
    (candidate.placement === null || isPlacementValue(candidate.placement)) &&
    isTargetKindArray(candidate.supportedTargets) &&
    isStringArray(candidate.targetCompletions) &&
    isStringArray(candidate.compatiblePathTargets) &&
    isStringArray(candidate.valueLabels) &&
    Array.isArray(candidate.signatures) &&
    candidate.signatures.every(isSerializedTagSignature) &&
    (candidate.tagHoverMarkdown === null || typeof candidate.tagHoverMarkdown === "string") &&
    (candidate.targetHoverMarkdown === null || typeof candidate.targetHoverMarkdown === "string") &&
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
        isSerializedTagSemanticContext(candidate.semantic) && isStringArray(candidate.valueLabels)
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

function hasCurrentProtocolVersion(
  value: unknown
): value is { readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION } {
  return isObjectRecord(value) && value["protocolVersion"] === FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
}

function isAnalysisDiagnosticLocation(value: unknown): value is FormSpecAnalysisDiagnosticLocation {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecAnalysisDiagnosticLocation>;
  return (
    typeof candidate.filePath === "string" &&
    isCommentSpan(candidate.range) &&
    (candidate.message === undefined || typeof candidate.message === "string")
  );
}

function isAnalysisDiagnostic(value: unknown): value is FormSpecAnalysisDiagnostic {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecAnalysisDiagnostic>;
  return (
    typeof candidate.code === "string" &&
    isDiagnosticCategory(candidate.category) &&
    typeof candidate.message === "string" &&
    isCommentSpan(candidate.range) &&
    (candidate.severity === "error" ||
      candidate.severity === "warning" ||
      candidate.severity === "info") &&
    Array.isArray(candidate.relatedLocations) &&
    candidate.relatedLocations.every(isAnalysisDiagnosticLocation) &&
    isDiagnosticDataRecord(candidate.data)
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
    (candidate.placement === null || isPlacementValue(candidate.placement)) &&
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
 *
 * @public
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
 *
 * @public
 */
export function isFormSpecSemanticQuery(value: unknown): value is FormSpecSemanticQuery {
  if (!hasCurrentProtocolVersion(value)) {
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
 *
 * @public
 */
export function isFormSpecSemanticResponse(value: unknown): value is FormSpecSemanticResponse {
  if (!hasCurrentProtocolVersion(value)) {
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
        typeof candidate.sourceHash === "string" && isSerializedCompletionContext(candidate.context)
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
 *
 * @public
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
 *
 * @internal
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
 *
 * @internal
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
 *
 * @internal
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
 *
 * @internal
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
 *
 * @internal
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
