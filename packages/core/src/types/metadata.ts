/**
 * Shared metadata model and policy types.
 *
 * @public
 */

/**
 * Whether a resolved metadata value was authored directly or inferred by policy.
 *
 * @public
 */
export type MetadataSource = "explicit" | "inferred";

/**
 * Declaration categories that metadata policy can target.
 *
 * @public
 */
export type MetadataDeclarationKind = "type" | "field" | "method";

/**
 * Authoring surfaces that can contribute metadata.
 *
 * @public
 */
export type MetadataAuthoringSurface = "tsdoc" | "chain-dsl";

/**
 * Build-facing context passed to metadata inference callbacks.
 *
 * `buildContext` is intentionally opaque so browser/runtime packages do not
 * need to depend on TypeScript compiler types.
 *
 * @public
 */
export interface MetadataInferenceContext {
  /** Authoring surface the metadata is being resolved for. */
  readonly surface: MetadataAuthoringSurface;
  /** Declaration kind currently being resolved. */
  readonly declarationKind: MetadataDeclarationKind;
  /** Logical identifier before any metadata policy is applied. */
  readonly logicalName: string;
  /** Optional build-only context supplied by the resolver. */
  readonly buildContext?: unknown;
}

/**
 * Callback used to infer a scalar metadata value.
 *
 * @public
 */
export type MetadataInferenceFn = (context: MetadataInferenceContext) => string;

/**
 * Build-facing context passed to enum-member metadata inference callbacks.
 *
 * Enum members are resolved separately from declaration-level metadata so they
 * do not participate in the shared declaration-kind model used by TSDoc and
 * extension metadata slots.
 *
 * @public
 */
export interface EnumMemberMetadataInferenceContext {
  /** Authoring surface the enum originated from. */
  readonly surface: MetadataAuthoringSurface;
  /** Logical member identifier used for policy inference. */
  readonly logicalName: string;
  /** Underlying enum value before stringification. */
  readonly memberValue: string | number;
  /** Optional build-only context supplied by the resolver. */
  readonly buildContext?: unknown;
}

/**
 * Callback used to infer enum-member display names.
 *
 * @public
 */
export type EnumMemberMetadataInferenceFn = (context: EnumMemberMetadataInferenceContext) => string;

/**
 * Context passed to extensible metadata inference hooks.
 *
 * @public
 */
export interface MetadataSlotInferenceContext extends MetadataInferenceContext {
  /** Stable logical slot identifier. */
  readonly slotId: MetadataSlotId;
  /** Tag name associated with the slot, without the `@` prefix. */
  readonly tagName: string;
  /** Optional qualifier being inferred (for example `plural`). */
  readonly qualifier?: string | undefined;
  /** Resolved bare/default value used as the base input for derived qualifiers. */
  readonly baseValue?: string | undefined;
}

/**
 * Callback used to infer an extensible metadata slot value.
 *
 * @public
 */
export type MetadataSlotInferenceFn = (context: MetadataSlotInferenceContext) => string;

/**
 * Context passed to pluralization callbacks.
 *
 * @public
 */
export interface MetadataPluralizationContext extends MetadataInferenceContext {
  /** Singular value that pluralization should derive from. */
  readonly singular: string;
}

/**
 * Callback used to derive plural metadata from a singular value.
 *
 * @public
 */
export type MetadataPluralizationFn = (context: MetadataPluralizationContext) => string;

/**
 * A single resolved scalar metadata value plus its provenance.
 *
 * @public
 */
export interface ResolvedScalarMetadata {
  /** Effective metadata value after policy resolution. */
  readonly value: string;
  /** Whether the value came from author intent or inference. */
  readonly source: MetadataSource;
}

/**
 * Shared resolved metadata model carried through canonicalization and
 * generation.
 *
 * @public
 */
export interface ResolvedMetadata {
  /** Effective JSON-facing singular name. */
  readonly apiName?: ResolvedScalarMetadata;
  /** Effective human-facing singular label. */
  readonly displayName?: ResolvedScalarMetadata;
  /** Effective JSON-facing plural name, where applicable. */
  readonly apiNamePlural?: ResolvedScalarMetadata;
  /** Effective human-facing plural label, where applicable. */
  readonly displayNamePlural?: ResolvedScalarMetadata;
}

/**
 * Zero-based half-open source span used by metadata analysis results.
 *
 * This mirrors the conventions used by tooling-facing comment spans without
 * introducing a dependency from core onto analysis package types.
 *
 * @public
 */
export interface MetadataSourceSpan {
  /** Zero-based start offset in the source file. */
  readonly start: number;
  /** One-past-the-end offset in the source file. */
  readonly end: number;
}

/**
 * Whether an explicit metadata value came from a bare or qualified tag form.
 *
 * @public
 */
export type ExplicitMetadataSourceForm = "bare" | "qualified";

/**
 * Fixer-oriented source details for an explicit metadata value.
 *
 * @public
 */
export interface ExplicitMetadataSource {
  /** Tag name associated with the explicit value, without the `@` prefix. */
  readonly tagName: string;
  /** Whether the explicit value used a qualifier such as `:plural`. */
  readonly form: ExplicitMetadataSourceForm;
  /** Full range covering the explicit tag occurrence. */
  readonly fullRange: MetadataSourceSpan;
  /** Range covering only the tag name token. */
  readonly tagNameRange: MetadataSourceSpan;
  /** Range covering the qualifier text, when present. */
  readonly qualifierRange?: MetadataSourceSpan | undefined;
  /** Range covering only the explicit value text. */
  readonly valueRange: MetadataSourceSpan;
  /** Qualifier text without the leading colon, when present. */
  readonly qualifier?: string | undefined;
}

/**
 * Stable slot identifier for extensible metadata analysis.
 *
 * @public
 */
export type MetadataSlotId = string;

/**
 * Supported qualifier registration for an extensible metadata slot.
 *
 * @public
 */
export interface MetadataQualifierRegistration {
  /** Qualifier text without the leading colon. */
  readonly qualifier: string;
  /**
   * Optional source qualifier to use as the base input for this qualifier's
   * inference hook. Defaults to the slot's bare/default value when omitted.
   */
  readonly sourceQualifier?: string | undefined;
  /** Optional inference hook for this qualified value. */
  readonly inferValue?: MetadataSlotInferenceFn | undefined;
}

/**
 * Extensible metadata slot definition shared across build- and lint-time analysis.
 *
 * @public
 */
export interface MetadataSlotRegistration {
  /** Stable logical slot identifier. */
  readonly slotId: MetadataSlotId;
  /** Tag name associated with this slot, without the `@` prefix. */
  readonly tagName: string;
  /** Declaration kinds where the slot is meaningful. */
  readonly declarationKinds: readonly MetadataDeclarationKind[];
  /** Whether a bare tag without a qualifier is supported. Defaults to true. */
  readonly allowBare?: boolean | undefined;
  /** Supported qualifiers for this slot. */
  readonly qualifiers?: readonly MetadataQualifierRegistration[] | undefined;
  /** Optional inference hook for the bare/default slot value. */
  readonly inferValue?: MetadataSlotInferenceFn | undefined;
  /**
   * Optional applicability hook for declaration-specific rules beyond
   * declaration kind. `buildContext` may carry compiler objects.
   */
  readonly isApplicable?: ((context: MetadataInferenceContext) => boolean) | undefined;
}

/**
 * One resolved metadata value from the shared analyzer.
 *
 * @public
 */
export interface MetadataResolvedEntry {
  /** Stable logical slot identifier. */
  readonly slotId: MetadataSlotId;
  /** Tag name associated with the slot, without the `@` prefix. */
  readonly tagName: string;
  /** Optional qualifier text without the leading colon. */
  readonly qualifier?: string | undefined;
  /** Effective value after explicit/inferred resolution. */
  readonly value: string;
  /** Whether the value came from source text or inference. */
  readonly source: MetadataSource;
  /** Fixer-oriented source details when the winning value was explicit. */
  readonly explicitSource?: ExplicitMetadataSource | undefined;
}

/**
 * Applicable metadata slot descriptor surfaced by the shared analyzer.
 *
 * @public
 */
export interface MetadataApplicableSlot {
  /** Stable logical slot identifier. */
  readonly slotId: MetadataSlotId;
  /** Tag name associated with the slot, without the `@` prefix. */
  readonly tagName: string;
  /** Whether the slot accepts a bare tag form. */
  readonly allowBare: boolean;
  /** Supported qualifier texts without their leading colons. */
  readonly qualifiers: readonly string[];
}

/**
 * Shared metadata-analysis result for one declaration.
 *
 * @public
 */
export interface MetadataAnalysisResult {
  /** Declaration kind that was analyzed. */
  readonly declarationKind: MetadataDeclarationKind;
  /** Logical declaration name before metadata policy is applied. */
  readonly logicalName: string;
  /** Slots that are applicable for the declaration. */
  readonly applicableSlots: readonly MetadataApplicableSlot[];
  /** Resolved slot entries after explicit/inferred resolution. */
  readonly entries: readonly MetadataResolvedEntry[];
  /** Projection of built-in naming metadata used by generators. */
  readonly resolvedMetadata?: ResolvedMetadata | undefined;
}

/**
 * Scalar metadata resolution modes.
 *
 * @public
 */
export type MetadataResolutionMode = "disabled" | "require-explicit" | "infer-if-missing";

/**
 * Pluralization disabled.
 *
 * @public
 */
export interface MetadataPluralizationDisabledPolicyInput {
  /** Disables automatic plural-value generation. */
  readonly mode?: "disabled" | undefined;
}

/**
 * Pluralization must be authored explicitly.
 *
 * @public
 */
export interface MetadataPluralizationRequireExplicitPolicyInput {
  /** Requires plural values to be authored directly. */
  readonly mode: "require-explicit";
}

/**
 * Pluralization may be inferred when absent.
 *
 * @public
 */
export interface MetadataPluralizationInferIfMissingPolicyInput {
  /** Infers plural values whenever no explicit plural is present. */
  readonly mode: "infer-if-missing";
  /** Callback that derives a plural form from the resolved singular value. */
  readonly inflect: MetadataPluralizationFn;
}

/**
 * Pluralization policy input.
 *
 * @public
 */
export type MetadataPluralizationPolicyInput =
  | MetadataPluralizationDisabledPolicyInput
  | MetadataPluralizationRequireExplicitPolicyInput
  | MetadataPluralizationInferIfMissingPolicyInput;

/**
 * Scalar metadata disabled unless provided explicitly elsewhere.
 *
 * @public
 */
export interface MetadataValueDisabledPolicyInput {
  /** Disables inference for this scalar metadata value. */
  readonly mode?: "disabled" | undefined;
  /** Optional policy controlling plural forms of this scalar value. */
  readonly pluralization?: MetadataPluralizationPolicyInput | undefined;
}

/**
 * Scalar metadata must be authored explicitly.
 *
 * @public
 */
export interface MetadataValueRequireExplicitPolicyInput {
  /** Requires this scalar metadata value to be authored directly. */
  readonly mode: "require-explicit";
  /** Optional policy controlling plural forms of this scalar value. */
  readonly pluralization?: MetadataPluralizationPolicyInput | undefined;
}

/**
 * Scalar metadata may be inferred when missing.
 *
 * @public
 */
export interface MetadataValueInferIfMissingPolicyInput {
  /** Infers this scalar metadata value when it is not authored explicitly. */
  readonly mode: "infer-if-missing";
  /** Callback used to infer the missing singular value. */
  readonly infer: MetadataInferenceFn;
  /** Optional policy controlling plural forms of this scalar value. */
  readonly pluralization?: MetadataPluralizationPolicyInput | undefined;
}

/**
 * Scalar metadata policy input.
 *
 * @public
 */
export type MetadataValuePolicyInput =
  | MetadataValueDisabledPolicyInput
  | MetadataValueRequireExplicitPolicyInput
  | MetadataValueInferIfMissingPolicyInput;

/**
 * Enum-member display names remain unset unless authored explicitly.
 *
 * @public
 */
export interface EnumMemberDisplayNameDisabledPolicyInput {
  /** Leaves missing enum-member display names unresolved. */
  readonly mode: "disabled";
}

/**
 * Enum members must declare display names explicitly.
 *
 * @public
 */
export interface EnumMemberDisplayNameRequireExplicitPolicyInput {
  /** Fails when an enum member has no authored display name. */
  readonly mode: "require-explicit";
}

/**
 * Missing enum-member display names may be inferred.
 *
 * @public
 */
export interface EnumMemberDisplayNameInferIfMissingPolicyInput {
  /** Infers an enum-member display name when it is not authored explicitly. */
  readonly mode: "infer-if-missing";
  /** Callback used to infer the missing display name. */
  readonly infer: EnumMemberMetadataInferenceFn;
}

/**
 * Enum-member display-name policy input.
 *
 * @public
 */
export type EnumMemberDisplayNamePolicyInput =
  | EnumMemberDisplayNameDisabledPolicyInput
  | EnumMemberDisplayNameRequireExplicitPolicyInput
  | EnumMemberDisplayNameInferIfMissingPolicyInput;

/**
 * User-facing enum-member metadata policy input.
 *
 * @public
 */
export interface EnumMemberMetadataPolicyInput {
  /** Policy for human-facing enum-member labels. */
  readonly displayName?: EnumMemberDisplayNamePolicyInput | undefined;
}

/**
 * Per-declaration metadata policy input.
 *
 * @public
 */
export interface DeclarationMetadataPolicyInput {
  /** Policy for JSON-facing serialized names. */
  readonly apiName?: MetadataValuePolicyInput | undefined;
  /** Policy for human-facing labels and titles. */
  readonly displayName?: MetadataValuePolicyInput | undefined;
}

/**
 * User-facing metadata policy configuration.
 *
 * @public
 */
export interface MetadataPolicyInput {
  /** Policy applied to named types and the analyzed root declaration. */
  readonly type?: DeclarationMetadataPolicyInput | undefined;
  /** Policy applied to fields and object properties. */
  readonly field?: DeclarationMetadataPolicyInput | undefined;
  /** Policy applied to callable/method declarations. */
  readonly method?: DeclarationMetadataPolicyInput | undefined;
  /** Policy applied to enum-member display names during build-time IR resolution. */
  readonly enumMember?: EnumMemberMetadataPolicyInput | undefined;
}

/**
 * Internal normalized pluralization policy.
 *
 * @public
 */
export interface NormalizedMetadataPluralizationPolicy {
  /** Effective pluralization mode after normalization. */
  readonly mode: "disabled" | "require-explicit" | "infer-if-missing";
  /** Normalized singular inference callback. */
  readonly infer: MetadataInferenceFn;
  /** Normalized pluralization callback. */
  readonly inflect: MetadataPluralizationFn;
}

/**
 * Internal normalized scalar metadata policy.
 *
 * @public
 */
export interface NormalizedMetadataValuePolicy {
  /** Effective scalar resolution mode after normalization. */
  readonly mode: "disabled" | "require-explicit" | "infer-if-missing";
  /** Normalized singular inference callback. */
  readonly infer: MetadataInferenceFn;
  /** Normalized pluralization policy for this scalar value. */
  readonly pluralization: NormalizedMetadataPluralizationPolicy;
}

/**
 * Internal normalized enum-member display-name policy.
 *
 * @public
 */
export interface NormalizedEnumMemberDisplayNamePolicy {
  /** Effective enum-member resolution mode after normalization. */
  readonly mode: "disabled" | "require-explicit" | "infer-if-missing";
  /** Normalized inference callback for missing enum-member display names. */
  readonly infer: EnumMemberMetadataInferenceFn;
}

/**
 * Internal normalized enum-member metadata policy.
 *
 * @public
 */
export interface NormalizedEnumMemberMetadataPolicy {
  /** Effective policy for enum-member display names. */
  readonly displayName: NormalizedEnumMemberDisplayNamePolicy;
}

/**
 * Internal normalized per-declaration metadata policy.
 *
 * @public
 */
export interface NormalizedDeclarationMetadataPolicy {
  /** Effective policy for JSON-facing serialized names. */
  readonly apiName: NormalizedMetadataValuePolicy;
  /** Effective policy for human-facing labels and titles. */
  readonly displayName: NormalizedMetadataValuePolicy;
}

/**
 * Internal normalized metadata policy.
 *
 * @public
 */
export interface NormalizedMetadataPolicy {
  /** Effective policy for named types and analyzed roots. */
  readonly type: NormalizedDeclarationMetadataPolicy;
  /** Effective policy for fields and object properties. */
  readonly field: NormalizedDeclarationMetadataPolicy;
  /** Effective policy for methods. */
  readonly method: NormalizedDeclarationMetadataPolicy;
  /** Effective policy for enum-member display names. */
  readonly enumMember: NormalizedEnumMemberMetadataPolicy;
}
