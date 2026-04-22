import type {
  EnumMemberDisplayNamePolicyInput,
  EnumMemberMetadataInferenceContext,
  MetadataAuthoringSurface,
  MetadataDeclarationKind,
  MetadataInferenceContext,
  MetadataPluralizationFn,
  MetadataPluralizationPolicyInput,
  MetadataPolicyInput,
  MetadataValuePolicyInput,
  NormalizedDeclarationMetadataPolicy,
  NormalizedEnumMemberDisplayNamePolicy,
  NormalizedEnumMemberMetadataPolicy,
  NormalizedMetadataPolicy,
  NormalizedMetadataPluralizationPolicy,
  NormalizedMetadataValuePolicy,
} from "@formspec/core/internals";
export type {
  NormalizedDeclarationMetadataPolicy,
  NormalizedMetadataPolicy,
} from "@formspec/core/internals";

export type MetadataResolutionContext = MetadataInferenceContext;
export type EnumMemberResolutionContext = EnumMemberMetadataInferenceContext;

const NOOP_INFLECT: MetadataPluralizationFn = () => "";

function normalizePluralization(
  input: MetadataPluralizationPolicyInput | undefined
): NormalizedMetadataPluralizationPolicy {
  if (input?.mode === "infer-if-missing") {
    return {
      mode: "infer-if-missing",
      infer: () => "",
      inflect: input.inflect,
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
  input: MetadataValuePolicyInput | undefined
): NormalizedMetadataValuePolicy {
  if (input?.mode === "infer-if-missing") {
    return {
      mode: "infer-if-missing",
      infer: input.infer,
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
    apiName: normalizeScalarPolicy(input?.apiName),
    displayName: normalizeScalarPolicy(input?.displayName),
  };
}

function normalizeEnumMemberDisplayNamePolicy(
  input: EnumMemberDisplayNamePolicyInput | undefined
): NormalizedEnumMemberDisplayNamePolicy {
  if (input?.mode === "infer-if-missing") {
    return {
      mode: "infer-if-missing",
      infer: input.infer,
    };
  }

  if (input?.mode === "require-explicit") {
    return {
      mode: "require-explicit",
      infer: () => "",
    };
  }

  return {
    mode: "disabled",
    infer: () => "",
  };
}

function normalizeEnumMemberPolicy(
  input: MetadataPolicyInput["enumMember"] | undefined
): NormalizedEnumMemberMetadataPolicy {
  return {
    displayName: normalizeEnumMemberDisplayNamePolicy(input?.displayName),
  };
}

export function normalizeMetadataPolicy(input?: MetadataPolicyInput): NormalizedMetadataPolicy {
  return {
    type: normalizeDeclarationPolicy(input?.type),
    field: normalizeDeclarationPolicy(input?.field),
    method: normalizeDeclarationPolicy(input?.method),
    enumMember: normalizeEnumMemberPolicy(input?.enumMember),
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
