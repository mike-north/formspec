import {
  getAllTagDefinitions,
  getTagDefinition,
  type FormSpecTagCategory,
  type FormSpecTargetKind,
  type FormSpecValueKind,
} from "@formspec/analysis";

export type { FormSpecTargetKind, FormSpecValueKind } from "@formspec/analysis";

export interface FormSpecTagMetadata {
  readonly canonicalName: string;
  readonly valueKind: FormSpecValueKind | null;
  readonly requiresArgument: boolean;
  readonly supportedTargets: readonly FormSpecTargetKind[];
  readonly allowDuplicates: boolean;
  readonly category: FormSpecTagCategory;
}

export const FORM_SPEC_TAGS_METADATA: ReadonlyMap<string, FormSpecTagMetadata> = new Map(
  getAllTagDefinitions().map((tag) => [tag.canonicalName, tag] as const)
);

export function normalizeFormSpecTagName(rawName: string): string {
  return rawName.charAt(0).toLowerCase() + rawName.slice(1);
}

export function getTagMetadata(rawName: string): FormSpecTagMetadata | null {
  return getTagDefinition(rawName);
}
