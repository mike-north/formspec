import { getTagDefinition, normalizeFormSpecTagName, type TagDefinition } from "@formspec/analysis";

export type {
  FormSpecTargetKind,
  FormSpecValueKind,
  TagDefinition as FormSpecTagMetadata,
} from "@formspec/analysis";

export { normalizeFormSpecTagName };

export function getTagMetadata(rawName: string): TagDefinition | null {
  return getTagDefinition(rawName);
}
