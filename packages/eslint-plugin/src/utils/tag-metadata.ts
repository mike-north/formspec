import {
  getTagDefinition,
  normalizeFormSpecTagName,
  type TagDefinition,
} from "@formspec/analysis/internal";

export type { FormSpecTargetKind, FormSpecValueKind } from "@formspec/analysis/internal";

export { normalizeFormSpecTagName };

export function getTagMetadata(rawName: string): TagDefinition | null {
  return getTagDefinition(rawName);
}
