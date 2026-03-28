import {
  getAllTagDefinitions,
  getTagDefinition,
  normalizeFormSpecTagName,
  type TagDefinition,
} from "@formspec/analysis";

export type {
  FormSpecTargetKind,
  FormSpecValueKind,
  TagDefinition as FormSpecTagMetadata,
} from "@formspec/analysis";

export const FORM_SPEC_TAGS_METADATA: ReadonlyMap<string, TagDefinition> = new Map(
  getAllTagDefinitions().map((tag) => [tag.canonicalName, tag] as const)
);

export { normalizeFormSpecTagName };

export function getTagMetadata(rawName: string): TagDefinition | null {
  return getTagDefinition(rawName);
}
