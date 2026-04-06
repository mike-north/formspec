export type {
  NormalizedPluralizationPolicy as NormalizedMetadataPluralizationPolicy,
  NormalizedMetadataScalarPolicy,
  NormalizedDeclarationMetadataPolicy,
  NormalizedMetadataPolicy,
  MetadataResolutionContext,
} from "./policy.js";
export {
  normalizeMetadataPolicy,
  getDeclarationMetadataPolicy,
  makeMetadataContext,
  defaultApiNameInference,
  defaultDisplayNameInference,
  getDefaultMetadataPolicy,
} from "./policy.js";
export type { ExplicitMetadataInput } from "./resolve.js";
export { resolveMetadata, getSerializedName, getDisplayName } from "./resolve.js";
export type { ResolveFormIRMetadataOptions } from "./resolve.js";
export { resolveFormIRMetadata, mergeResolvedMetadata } from "./resolve.js";
