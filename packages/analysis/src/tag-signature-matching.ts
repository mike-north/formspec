/**
 * Role-A placement + target-kind overload filter.
 *
 * Exposes {@link getMatchingTagSignatures} — the shared Role-A pre-check used
 * by both the build and snapshot consumers to determine whether a tag is
 * allowed on a given placement/target-kind combination.
 */

import {
  type FormSpecPlacement,
  type TagDefinition,
  type TagSignature,
  type TagSignatureParameter,
} from "./tag-registry.js";

/**
 * Target kinds surfaced by `getMatchingTagSignatures`.
 *
 * A missing target is modeled by passing `null` rather than a dedicated
 * `"none"` variant.
 */
export type TagTargetKind = "path" | "member" | "variant";

function targetKindForParameter(parameter: TagSignatureParameter): TagTargetKind | null {
  switch (parameter.kind) {
    case "target-path":
      return "path";
    case "target-member":
      return "member";
    case "target-variant":
      return "variant";
    case "value":
      return null;
    default: {
      const exhaustive: never = parameter.kind;
      return exhaustive;
    }
  }
}

function getSignatureTargetKind(signature: TagSignature): TagTargetKind | null {
  for (const parameter of signature.parameters) {
    const targetKind = targetKindForParameter(parameter);
    if (targetKind !== null) {
      return targetKind;
    }
  }

  return null;
}

/**
 * Filters a tag definition's overloads down to the ones that apply to the
 * requested placement and target form.
 *
 * Used as the Role-A placement pre-check in both the build and snapshot
 * consumers. An empty result means the tag is not allowed on the requested
 * placement/target combination — callers emit `INVALID_TAG_PLACEMENT`.
 */
export function getMatchingTagSignatures(
  definition: TagDefinition,
  placement: FormSpecPlacement,
  targetKind: TagTargetKind | null
): readonly TagSignature[] {
  return definition.signatures.filter(
    (signature) =>
      signature.placements.includes(placement) && getSignatureTargetKind(signature) === targetKind
  );
}
