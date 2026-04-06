import type {
  MetadataAuthoringSurface,
  MetadataDeclarationKind,
  MetadataInferenceContext,
  MetadataInferenceFn,
  MetadataPluralizationFn,
  MetadataPluralizationPolicyInput,
  MetadataPolicyInput,
  MetadataValuePolicyInput,
  NormalizedDeclarationMetadataPolicy,
  NormalizedMetadataPolicy,
  NormalizedMetadataPluralizationPolicy,
  NormalizedMetadataValuePolicy,
} from "@formspec/core/internals";
export type {
  NormalizedDeclarationMetadataPolicy,
  NormalizedMetadataPolicy,
  NormalizedMetadataPluralizationPolicy as NormalizedPluralizationPolicy,
} from "@formspec/core/internals";

export type MetadataResolutionContext = MetadataInferenceContext;
export type NormalizedMetadataScalarPolicy = NormalizedMetadataValuePolicy;

export function defaultApiNameInference(
  _context: MetadataResolutionContext
): string {
  return "";
}

export function defaultDisplayNameInference(
  _context: MetadataResolutionContext
): string {
  return "";
}

const NOOP_INFLECT: MetadataPluralizationFn = () => "";

function normalizePluralization(
  input: MetadataPluralizationPolicyInput | undefined
): NormalizedMetadataPluralizationPolicy {
  if (input?.mode === "infer-if-missing") {
    return {
      mode: "infer-if-missing",
      infer: () => "",
      inflect: input.inflect ?? NOOP_INFLECT,
    };
  }

  if (input?.mode === "require-explicit") {
    return {
      mode: "require-explicit",
      infer: () => "",
      inflect: NOOP_INFLECT,
    };
  }

  return {
    mode: "disabled",
    infer: () => "",
    inflect: NOOP_INFLECT,
  };
}

function normalizeScalarPolicy(
  input: MetadataValuePolicyInput | undefined,
  fallbackInfer: MetadataInferenceFn
): NormalizedMetadataValuePolicy {
  if (input?.mode === "infer-if-missing") {
    return {
      mode: "infer-if-missing",
      infer: input.infer ?? fallbackInfer,
      pluralization: normalizePluralization(input.pluralization),
    };
  }

  if (input?.mode === "require-explicit") {
    return {
      mode: "require-explicit",
      infer: () => "",
      pluralization: normalizePluralization(input.pluralization),
    };
  }

  return {
    mode: "disabled",
    infer: () => "",
    pluralization: normalizePluralization(input?.pluralization),
  };
}

function normalizeDeclarationPolicy(
  input: MetadataPolicyInput[MetadataDeclarationKind] | undefined
): NormalizedDeclarationMetadataPolicy {
  return {
    apiName: normalizeScalarPolicy(input?.apiName, defaultApiNameInference),
    displayName: normalizeScalarPolicy(input?.displayName, defaultDisplayNameInference),
  };
}

export function normalizeMetadataPolicy(
  input?: MetadataPolicyInput
): NormalizedMetadataPolicy {
  return {
    type: normalizeDeclarationPolicy(input?.type),
    field: normalizeDeclarationPolicy(input?.field),
    method: normalizeDeclarationPolicy(input?.method),
  };
}

export function getDeclarationMetadataPolicy(
  policy: NormalizedMetadataPolicy,
  declarationKind: MetadataDeclarationKind
): NormalizedDeclarationMetadataPolicy {
  return policy[declarationKind];
}

export function makeMetadataContext(
  surface: MetadataAuthoringSurface,
  declarationKind: MetadataDeclarationKind,
  logicalName: string,
  buildContext?: unknown
): MetadataResolutionContext {
  return {
    surface,
    declarationKind,
    logicalName,
    ...(buildContext !== undefined && { buildContext }),
  };
}

export function getDefaultMetadataPolicy(): NormalizedMetadataPolicy {
  return normalizeMetadataPolicy(undefined);
}
