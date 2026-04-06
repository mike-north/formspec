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
}
