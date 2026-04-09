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
 * Version of the transport protocol shared by analysis producers and consumers.
 *
 * @public
 */
export const FORMSPEC_ANALYSIS_PROTOCOL_VERSION = 4;
/**
 * Version of the serialized analysis payload schema.
 *
 * @public
 */
export const FORMSPEC_ANALYSIS_SCHEMA_VERSION = 2;

/**
 * Serializable source details for one explicit metadata value.
 *
 * @public
 */
export interface FormSpecSerializedExplicitMetadataSource {
  /** Tag name associated with the explicit value, without the `@` prefix. */
  readonly tagName: string;
  /** Whether the explicit value used a bare or qualified tag form. */
  readonly form: "bare" | "qualified";
  /** Full range covering the explicit tag occurrence. */
  readonly fullRange: CommentSpan;
  /** Range covering only the tag name token. */
  readonly tagNameRange: CommentSpan;
  /** Range covering the qualifier text, when present. */
  readonly qualifierRange?: CommentSpan | undefined;
  /** Range covering only the explicit value text. */
  readonly valueRange: CommentSpan;
  /** Qualifier text without the leading colon, when present. */
  readonly qualifier?: string | undefined;
}

/**
 * Serializable scalar metadata value plus its provenance.
 *
 * @public
 */
export interface FormSpecSerializedResolvedScalarMetadata {
  /** Effective metadata value after policy resolution. */
  readonly value: string;
  /** Whether the value was authored directly or inferred. */
  readonly source: "explicit" | "inferred";
}

/**
 * Serializable built-in metadata projection for one declaration.
 *
 * @public
 */
export interface FormSpecSerializedResolvedMetadata {
  /** Effective JSON-facing singular name. */
  readonly apiName?: FormSpecSerializedResolvedScalarMetadata | undefined;
  /** Effective human-facing singular label. */
  readonly displayName?: FormSpecSerializedResolvedScalarMetadata | undefined;
  /** Effective JSON-facing plural name, where applicable. */
  readonly apiNamePlural?: FormSpecSerializedResolvedScalarMetadata | undefined;
  /** Effective human-facing plural label, where applicable. */
  readonly displayNamePlural?: FormSpecSerializedResolvedScalarMetadata | undefined;
}

/**
 * Serializable metadata slot resolution for one declaration.
 *
 * @public
 */
export interface FormSpecSerializedMetadataEntry {
  /** Stable logical slot identifier. */
  readonly slotId: string;
  /** Tag name associated with the slot, without the `@` prefix. */
  readonly tagName: string;
  /** Optional qualifier text without the leading colon. */
  readonly qualifier?: string | undefined;
  /** Effective value after explicit/inferred resolution. */
  readonly value: string;
  /** Whether the value was authored directly or inferred. */
  readonly source: "explicit" | "inferred";
  /** Fixer-oriented source details when the winning value was explicit. */
  readonly explicitSource?: FormSpecSerializedExplicitMetadataSource | undefined;
}

/**
 * JSON-safe value carried by declaration summary facts.
 *
 * @public
 */
export type FormSpecSerializedJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly FormSpecSerializedJsonValue[]
  | { readonly [key: string]: FormSpecSerializedJsonValue };

/**
 * Structured declaration-level fact derived from one or more comment tags.
 *
 * @public
 */
export type FormSpecSerializedDeclarationFact =
  | {
      /** Summary text attached to the declaration body before the first tag. */
      readonly kind: "description";
      /** Summary text rendered from the declaration doc comment. */
      readonly value: string;
    }
  | {
      /** Additional remarks text attached to the declaration. */
      readonly kind: "remarks";
      /** Remarks text as authored. */
      readonly value: string;
    }
  | {
      /** Default JSON value carried by the declaration metadata. */
      readonly kind: "default-value";
      /** Parsed JSON-safe default value. */
      readonly value: FormSpecSerializedJsonValue;
    }
  | {
      /** Example text attached to the declaration. */
      readonly kind: "example";
      /** Example text as authored. */
      readonly value: string;
    }
  | {
      /** Deprecation status for the declaration. */
      readonly kind: "deprecated";
      /** Optional deprecation guidance authored alongside the tag. */
      readonly message: string | null;
    }
  | {
      /** Combined numeric constraints for one declaration target. */
      readonly kind: "numeric-constraints";
      /** Target path receiving the constraints, or `null` for the declaration itself. */
      readonly targetPath: string | null;
      /** Inclusive lower bound, when present. */
      readonly minimum?: number | undefined;
      /** Inclusive upper bound, when present. */
      readonly maximum?: number | undefined;
      /** Exclusive lower bound, when present. */
      readonly exclusiveMinimum?: number | undefined;
      /** Exclusive upper bound, when present. */
      readonly exclusiveMaximum?: number | undefined;
      /** Divisibility constraint, when present. */
      readonly multipleOf?: number | undefined;
    }
  | {
      /** Combined string constraints for one declaration target. */
      readonly kind: "string-constraints";
      /** Target path receiving the constraints, or `null` for the declaration itself. */
      readonly targetPath: string | null;
      /** Minimum string length, when present. */
      readonly minLength?: number | undefined;
      /** Maximum string length, when present. */
      readonly maxLength?: number | undefined;
      /** Regex patterns that must all be satisfied. */
      readonly patterns: readonly string[];
    }
  | {
      /** Combined array constraints for one declaration target. */
      readonly kind: "array-constraints";
      /** Target path receiving the constraints, or `null` for the declaration itself. */
      readonly targetPath: string | null;
      /** Minimum item count, when present. */
      readonly minItems?: number | undefined;
      /** Maximum item count, when present. */
      readonly maxItems?: number | undefined;
      /** Whether items must be unique. */
      readonly uniqueItems?: boolean | undefined;
    }
  | {
      /** Enum/member whitelist constraint for one declaration target. */
      readonly kind: "allowed-members";
      /** Target path receiving the constraint, or `null` for the declaration itself. */
      readonly targetPath: string | null;
      /** Allowed member identifiers after normalization. */
      readonly members: readonly (string | number)[];
    }
  | {
      /** Constant-value constraint for one declaration target. */
      readonly kind: "const";
      /** Target path receiving the constraint, or `null` for the declaration itself. */
      readonly targetPath: string | null;
      /** Constant JSON-safe value. */
      readonly value: FormSpecSerializedJsonValue;
    }
  | {
      /** Extension-defined constraint fact for one declaration target. */
      readonly kind: "custom-constraint";
      /** Target path receiving the constraint, or `null` for the declaration itself. */
      readonly targetPath: string | null;
      /** Stable extension-qualified constraint identifier. */
      readonly constraintId: string;
      /** Composition rule used when combining repeated applications. */
      readonly compositionRule: "intersect" | "override";
      /** JSON-safe payload parsed from the authored tag. */
      readonly payload: FormSpecSerializedJsonValue;
    };

/**
 * Public declaration-level semantic summary for one documented declaration.
 *
 * @public
 */
export interface FormSpecAnalysisDeclarationSummary {
  /** Summary text attached to the declaration before the first tag, if present. */
  readonly summaryText: string | null;
  /** Built-in resolved metadata projected for the declaration. */
  readonly resolvedMetadata: FormSpecSerializedResolvedMetadata | null;
  /** Resolved metadata entries, including extension-contributed slots. */
  readonly metadataEntries: readonly FormSpecSerializedMetadataEntry[];
  /** Structured declaration facts derived by FormSpec. */
  readonly facts: readonly FormSpecSerializedDeclarationFact[];
  /** Pre-rendered markdown optimized for declaration hover surfaces. */
  readonly hoverMarkdown: string;
}

/**
 * Cross-process endpoint used by the language server to reach the semantic
 * tsserver plugin on the current workspace host.
 *
 * @public
 */
export interface FormSpecIpcEndpoint {
  /** Transport kind used to reach the semantic service. */
  readonly kind: "unix-socket" | "windows-pipe";
  /** Socket path or named-pipe address for the service. */
  readonly address: string;
}

/**
 * Discovery record written by the tsserver plugin so other FormSpec tooling
 * can locate and validate the matching semantic service for a workspace.
 *
 * @public
 */
export interface FormSpecAnalysisManifest {
  /** Protocol version expected by consumers of this manifest. */
  readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
  /** Schema version for the serialized analysis payload. */
  readonly analysisSchemaVersion: typeof FORMSPEC_ANALYSIS_SCHEMA_VERSION;
  /** Absolute root of the workspace being analyzed. */
  readonly workspaceRoot: string;
  /** Stable workspace identifier used for runtime artifacts. */
  readonly workspaceId: string;
  /** IPC endpoint for the active semantic service. */
  readonly endpoint: FormSpecIpcEndpoint;
  /** TypeScript version reported by the host runtime. */
  readonly typescriptVersion: string;
  /** Hash of the active extension set for the workspace. */
  readonly extensionFingerprint: string;
  /** Monotonic generation number for the manifest file. */
  readonly generation: number;
  /** ISO timestamp for the last manifest update. */
  readonly updatedAt: string;
}

/**
 * Serializable subset of tag metadata needed by hover and completion UIs.
 *
 * @public
 */
export interface FormSpecSerializedTagDefinition {
  /** Canonical tag name, including the leading `@`. */
  readonly canonicalName: string;
  /** Short completion detail shown in UI pickers. */
  readonly completionDetail: string;
  /** Markdown hover text for the tag name. */
  readonly hoverMarkdown: string;
}

/**
 * Serializable overload/signature summary for one comment tag form.
 *
 * @public
 */
export interface FormSpecSerializedTagSignature {
  /** Human-readable label for the signature form. */
  readonly label: string;
  /** Target kinds accepted by this signature. */
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
  /** Whether the target parsed cleanly. */
  readonly valid: boolean;
  /** Classified target kind used by completion and hover. */
  readonly kind: "path" | "member" | "variant" | "ambiguous";
  /** Full span covering the colon and target text. */
  readonly fullSpan: CommentSpan;
  /** Span covering only the leading colon. */
  readonly colonSpan: CommentSpan;
  /** Span covering the target text after the colon. */
  readonly span: CommentSpan;
}

/**
 * Semantic facts about one parsed tag, reduced to JSON-safe data for IPC.
 *
 * @public
 */
export interface FormSpecSerializedTagSemanticContext {
  /** Tag name in canonical `@tag` form. */
  readonly tagName: string;
  /** Resolved tag definition, if the tag is recognized. */
  readonly tagDefinition: FormSpecSerializedTagDefinition | null;
  /** Placement inferred for the tag in the current comment. */
  readonly placement: FormSpecPlacement | null;
  /** Usage variants filtered to the active tag occurrence. */
  readonly contextualSignatures: readonly FormSpecSerializedTagSignature[];
  /** Target kinds supported by the tag. */
  readonly supportedTargets: readonly FormSpecTargetKind[];
  /** Completion candidates for tag targets. */
  readonly targetCompletions: readonly string[];
  /** Path targets compatible with the current cursor context. */
  readonly compatiblePathTargets: readonly string[];
  /** Display labels for known argument values. */
  readonly valueLabels: readonly string[];
  /** Completion candidates for the argument position. */
  readonly argumentCompletions: readonly string[];
  /** Markdown hover content for the tag in the active occurrence context. */
  readonly contextualTagHoverMarkdown: string | null;
  /** Summaries of the tag's overloads or signatures. */
  readonly signatures: readonly FormSpecSerializedTagSignature[];
  /** Markdown hover content for the tag itself. */
  readonly tagHoverMarkdown: string | null;
  /** Markdown hover content for the target, if applicable. */
  readonly targetHoverMarkdown: string | null;
  /** Markdown hover content for the argument, if applicable. */
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
      /** Completion mode indicating the cursor is on a tag name. */
      readonly kind: "tag-name";
      /** Current partially typed tag prefix. */
      readonly prefix: string;
      /** Tags available at the current cursor location. */
      readonly availableTags: readonly FormSpecSerializedTagDefinition[];
    }
  | {
      /** Completion mode indicating the cursor is on a target specifier. */
      readonly kind: "target";
      /** Semantic context for the active tag. */
      readonly semantic: FormSpecSerializedTagSemanticContext;
    }
  | {
      /** Completion mode indicating the cursor is in an argument position. */
      readonly kind: "argument";
      /** Semantic context for the active tag. */
      readonly semantic: FormSpecSerializedTagSemanticContext;
      /** Suggested value labels for argument completion. */
      readonly valueLabels: readonly string[];
    }
  | {
      /** Sentinel indicating that no FormSpec completion is available. */
      readonly kind: "none";
    };

/**
 * Hover payload for a single comment token under the cursor.
 *
 * @public
 */
export interface FormSpecSerializedHoverInfo {
  /** Token kind that produced this hover payload. */
  readonly kind: "tag-name" | "target" | "argument" | "declaration";
  /** Markdown content returned to the hover UI. */
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
  /** Absolute path to the related source file. */
  readonly filePath: string;
  /** Span associated with the related location. */
  readonly range: CommentSpan;
  /** Optional human-readable note for the location. */
  readonly message?: string;
}

/**
 * File-local diagnostic derived from comment parsing or semantic analysis.
 *
 * @public
 */
export interface FormSpecAnalysisDiagnostic {
  /** Stable diagnostic code for programmatic handling. */
  readonly code: string;
  /** Diagnostic family used by the analysis pipeline. */
  readonly category: FormSpecAnalysisDiagnosticCategory;
  /** Human-readable diagnostic message. */
  readonly message: string;
  /** Primary source span for the diagnostic. */
  readonly range: CommentSpan;
  /** Diagnostic severity reported to consumers. */
  readonly severity: "error" | "warning" | "info";
  /** Additional related source locations. */
  readonly relatedLocations: readonly FormSpecAnalysisDiagnosticLocation[];
  /** Structured diagnostic metadata. */
  readonly data: Record<string, FormSpecAnalysisDiagnosticDataValue>;
}

/**
 * Serializable view of a single parsed FormSpec tag within a doc comment.
 *
 * @public
 */
export interface FormSpecAnalysisTagSnapshot {
  /** Raw tag name as written in the comment. */
  readonly rawTagName: string;
  /** Normalized tag name used for lookup. */
  readonly normalizedTagName: string;
  /** Whether the tag was recognized by the registry. */
  readonly recognized: boolean;
  /** Full span covering the parsed tag. */
  readonly fullSpan: CommentSpan;
  /** Span of the tag name itself. */
  readonly tagNameSpan: CommentSpan;
  /** Span of the payload after the tag name. */
  readonly payloadSpan: CommentSpan | null;
  /** Parsed target specifier, if one was present. */
  readonly target: FormSpecSerializedCommentTargetSpecifier | null;
  /** Span covering the argument text, if present. */
  readonly argumentSpan: CommentSpan | null;
  /** Raw argument text. */
  readonly argumentText: string;
  /** Serialized semantic data for the tag. */
  readonly semantic: FormSpecSerializedTagSemanticContext;
}

/**
 * Serializable view of one declaration-attached doc comment in a source file.
 *
 * @public
 */
export interface FormSpecAnalysisCommentSnapshot {
  /** Span covering the doc comment itself. */
  readonly commentSpan: CommentSpan;
  /** Span covering the associated declaration. */
  readonly declarationSpan: CommentSpan;
  /** Where the comment was attached in relation to the declaration. */
  readonly placement: FormSpecPlacement | null;
  /** Resolved type of the documented subject, if known. */
  readonly subjectType: string | null;
  /** Resolved host type that owns the comment, if known. */
  readonly hostType: string | null;
  /** Declaration-level applied metadata and constraints derived by FormSpec. */
  readonly declarationSummary: FormSpecAnalysisDeclarationSummary;
  /** Parsed tags contained in the doc comment. */
  readonly tags: readonly FormSpecAnalysisTagSnapshot[];
}

/**
 * Serializable analysis artifact for a single source file.
 *
 * @public
 */
export interface FormSpecAnalysisFileSnapshot {
  /** Absolute path to the analyzed file. */
  readonly filePath: string;
  /** Stable hash of the file contents. */
  readonly sourceHash: string;
  /** ISO timestamp when the snapshot was generated. */
  readonly generatedAt: string;
  /** Parsed doc comments found in the file. */
  readonly comments: readonly FormSpecAnalysisCommentSnapshot[];
  /** Diagnostics emitted for the file. */
  readonly diagnostics: readonly FormSpecAnalysisDiagnostic[];
}

/**
 * Query variants supported by the semantic tsserver plugin.
 *
 * @public
 */
export type FormSpecSemanticQuery =
  | {
      /** Protocol version carried with every request. */
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      /** Query variant requesting health/manifest information. */
      readonly kind: "health";
    }
  | {
      /** Protocol version carried with every request. */
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      /** Query variant requesting completion context. */
      readonly kind: "completion";
      /** Absolute path of the source file. */
      readonly filePath: string;
      /** Zero-based cursor offset in the file. */
      readonly offset: number;
    }
  | {
      /** Protocol version carried with every request. */
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      /** Query variant requesting hover information. */
      readonly kind: "hover";
      /** Absolute path of the source file. */
      readonly filePath: string;
      /** Zero-based cursor offset in the file. */
      readonly offset: number;
    }
  | {
      /** Protocol version carried with every request. */
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      /** Query variant requesting diagnostics only. */
      readonly kind: "diagnostics";
      /** Absolute path of the source file. */
      readonly filePath: string;
    }
  | {
      /** Protocol version carried with every request. */
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      /** Query variant requesting a full serialized file snapshot. */
      readonly kind: "file-snapshot";
      /** Absolute path of the source file. */
      readonly filePath: string;
    };

/**
 * Response variants returned by the semantic tsserver plugin.
 *
 * @public
 */
export type FormSpecSemanticResponse =
  | {
      /** Protocol version carried with every response. */
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      /** Response variant carrying health information. */
      readonly kind: "health";
      /** Manifest describing the active semantic service. */
      readonly manifest: FormSpecAnalysisManifest;
    }
  | {
      /** Protocol version carried with every response. */
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      /** Response variant carrying completion context. */
      readonly kind: "completion";
      /** Source hash used to validate cursor data freshness. */
      readonly sourceHash: string;
      /** Completion context for the requested cursor position. */
      readonly context: FormSpecSerializedCompletionContext;
    }
  | {
      /** Protocol version carried with every response. */
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      /** Response variant carrying hover information. */
      readonly kind: "hover";
      /** Source hash used to validate hover freshness. */
      readonly sourceHash: string;
      /** Hover payload, if one is available. */
      readonly hover: FormSpecSerializedHoverInfo | null;
    }
  | {
      /** Protocol version carried with every response. */
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      /** Response variant carrying diagnostics. */
      readonly kind: "diagnostics";
      /** Source hash used to validate diagnostic freshness. */
      readonly sourceHash: string;
      /** Diagnostics for the requested file. */
      readonly diagnostics: readonly FormSpecAnalysisDiagnostic[];
    }
  | {
      /** Protocol version carried with every response. */
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      /** Response variant carrying a serialized file snapshot. */
      readonly kind: "file-snapshot";
      /** Snapshot of the requested file, if available. */
      readonly snapshot: FormSpecAnalysisFileSnapshot | null;
    }
  | {
      /** Protocol version carried with every response. */
      readonly protocolVersion: typeof FORMSPEC_ANALYSIS_PROTOCOL_VERSION;
      /** Error response variant. */
      readonly kind: "error";
      /** Human-readable error message. */
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBooleanArray(value: unknown): value is readonly boolean[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "boolean");
}

function isJsonValue(value: unknown): value is FormSpecSerializedJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }

  if (isFiniteNumber(value)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (!isObjectRecord(value)) {
    return false;
  }

  return Object.values(value).every(isJsonValue);
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
    Array.isArray(candidate.contextualSignatures) &&
    candidate.contextualSignatures.every(isSerializedTagSignature) &&
    isTargetKindArray(candidate.supportedTargets) &&
    isStringArray(candidate.targetCompletions) &&
    isStringArray(candidate.compatiblePathTargets) &&
    isStringArray(candidate.valueLabels) &&
    isStringArray(candidate.argumentCompletions) &&
    Array.isArray(candidate.signatures) &&
    candidate.signatures.every(isSerializedTagSignature) &&
    (candidate.contextualTagHoverMarkdown === null ||
      typeof candidate.contextualTagHoverMarkdown === "string") &&
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
      candidate.kind === "argument" ||
      candidate.kind === "declaration") &&
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

function isExplicitMetadataSource(
  value: unknown
): value is FormSpecSerializedExplicitMetadataSource {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecSerializedExplicitMetadataSource>;
  return (
    typeof candidate.tagName === "string" &&
    (candidate.form === "bare" || candidate.form === "qualified") &&
    isCommentSpan(candidate.fullRange) &&
    isCommentSpan(candidate.tagNameRange) &&
    (candidate.qualifierRange === undefined || isCommentSpan(candidate.qualifierRange)) &&
    isCommentSpan(candidate.valueRange) &&
    (candidate.qualifier === undefined || typeof candidate.qualifier === "string")
  );
}

function isResolvedScalarMetadata(
  value: unknown
): value is FormSpecSerializedResolvedScalarMetadata {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecSerializedResolvedScalarMetadata>;
  return (
    typeof candidate.value === "string" &&
    (candidate.source === "explicit" || candidate.source === "inferred")
  );
}

function isResolvedMetadata(value: unknown): value is FormSpecSerializedResolvedMetadata {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecSerializedResolvedMetadata>;
  return (
    (candidate.apiName === undefined || isResolvedScalarMetadata(candidate.apiName)) &&
    (candidate.displayName === undefined || isResolvedScalarMetadata(candidate.displayName)) &&
    (candidate.apiNamePlural === undefined ||
      isResolvedScalarMetadata(candidate.apiNamePlural)) &&
    (candidate.displayNamePlural === undefined ||
      isResolvedScalarMetadata(candidate.displayNamePlural))
  );
}

function isMetadataEntry(value: unknown): value is FormSpecSerializedMetadataEntry {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecSerializedMetadataEntry>;
  return (
    typeof candidate.slotId === "string" &&
    typeof candidate.tagName === "string" &&
    (candidate.qualifier === undefined || typeof candidate.qualifier === "string") &&
    typeof candidate.value === "string" &&
    (candidate.source === "explicit" || candidate.source === "inferred") &&
    (candidate.explicitSource === undefined ||
      isExplicitMetadataSource(candidate.explicitSource))
  );
}

function isDeclarationFact(value: unknown): value is FormSpecSerializedDeclarationFact {
  if (!isObjectRecord(value) || typeof value["kind"] !== "string") {
    return false;
  }

  const candidate = value as Partial<FormSpecSerializedDeclarationFact>;
  switch (candidate.kind) {
    case "description":
    case "remarks":
    case "example":
      return typeof candidate.value === "string";
    case "default-value":
      return isJsonValue(candidate.value);
    case "deprecated":
      return candidate.message === null || typeof candidate.message === "string";
    case "numeric-constraints":
      return (
        (candidate.targetPath === null || typeof candidate.targetPath === "string") &&
        (candidate.minimum === undefined || isFiniteNumber(candidate.minimum)) &&
        (candidate.maximum === undefined || isFiniteNumber(candidate.maximum)) &&
        (candidate.exclusiveMinimum === undefined || isFiniteNumber(candidate.exclusiveMinimum)) &&
        (candidate.exclusiveMaximum === undefined || isFiniteNumber(candidate.exclusiveMaximum)) &&
        (candidate.multipleOf === undefined || isFiniteNumber(candidate.multipleOf))
      );
    case "string-constraints":
      return (
        (candidate.targetPath === null || typeof candidate.targetPath === "string") &&
        (candidate.minLength === undefined || isFiniteNumber(candidate.minLength)) &&
        (candidate.maxLength === undefined || isFiniteNumber(candidate.maxLength)) &&
        isStringArray(candidate.patterns)
      );
    case "array-constraints":
      return (
        (candidate.targetPath === null || typeof candidate.targetPath === "string") &&
        (candidate.minItems === undefined || isFiniteNumber(candidate.minItems)) &&
        (candidate.maxItems === undefined || isFiniteNumber(candidate.maxItems)) &&
        (candidate.uniqueItems === undefined || typeof candidate.uniqueItems === "boolean")
      );
    case "allowed-members":
      return (
        (candidate.targetPath === null || typeof candidate.targetPath === "string") &&
        Array.isArray(candidate.members) &&
        candidate.members.every(
          (member) => typeof member === "string" || isFiniteNumber(member)
        )
      );
    case "const":
      return (
        (candidate.targetPath === null || typeof candidate.targetPath === "string") &&
        isJsonValue(candidate.value)
      );
    case "custom-constraint":
      return (
        (candidate.targetPath === null || typeof candidate.targetPath === "string") &&
        typeof candidate.constraintId === "string" &&
        (candidate.compositionRule === "intersect" || candidate.compositionRule === "override") &&
        isJsonValue(candidate.payload)
      );
    default:
      return false;
  }
}

function isDeclarationSummary(value: unknown): value is FormSpecAnalysisDeclarationSummary {
  if (!isObjectRecord(value)) {
    return false;
  }

  const candidate = value as Partial<FormSpecAnalysisDeclarationSummary>;
  return (
    (candidate.summaryText === null || typeof candidate.summaryText === "string") &&
    (candidate.resolvedMetadata === null || isResolvedMetadata(candidate.resolvedMetadata)) &&
    Array.isArray(candidate.metadataEntries) &&
    candidate.metadataEntries.every(isMetadataEntry) &&
    Array.isArray(candidate.facts) &&
    candidate.facts.every(isDeclarationFact) &&
    typeof candidate.hoverMarkdown === "string"
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
    isDeclarationSummary(candidate.declarationSummary) &&
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
    contextualSignatures: semantic.contextualSignatures.map((signature) => ({
      label: signature.label,
      placements: signature.placements,
    })),
    supportedTargets: semantic.supportedTargets,
    targetCompletions: semantic.targetCompletions,
    compatiblePathTargets: semantic.compatiblePathTargets,
    valueLabels: semantic.valueLabels,
    argumentCompletions: semantic.argumentCompletions,
    contextualTagHoverMarkdown: semantic.contextualTagHoverMarkdown,
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
