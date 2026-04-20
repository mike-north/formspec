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

// ---------------------------------------------------------------------------
// Extension-settings tag-name extraction
// ---------------------------------------------------------------------------
// Minimal structural views of the `ExtensionRegistry` stored in
// `context.settings.formspec.extensionRegistry`. Typed locally to avoid
// pulling `@formspec/build` into ESLint rules.

interface SettingsExtensionRegistry {
  readonly extensions: readonly SettingsExtensionDefinition[];
}

interface SettingsExtensionDefinition {
  readonly constraintTags?: readonly { readonly tagName: string }[];
  readonly metadataSlots?: readonly { readonly tagName: string }[];
  readonly annotations?: readonly { readonly annotationName: string }[];
}

/**
 * Reads all tag names registered by extensions in `context.settings`.
 *
 * Covers constraint tags, metadata slots, and annotation tags — all three
 * can be authored as TSDoc block tags in FormSpec class declarations.
 *
 * Returns a sorted, deduplicated array of normalized tag names (no `@` prefix).
 */
export function readExtensionTagNames(settings: Readonly<Record<string, unknown>>): readonly string[] {
  const formspec = settings["formspec"];
  if (typeof formspec !== "object" || formspec === null) return [];
  const registry = (formspec as Record<string, unknown>)["extensionRegistry"];
  if (typeof registry !== "object" || registry === null) return [];
  const extensions = (registry as Partial<SettingsExtensionRegistry>).extensions;
  if (!Array.isArray(extensions)) return [];
  const typedExtensions: readonly SettingsExtensionDefinition[] = extensions;
  const names = new Set<string>();
  for (const extension of typedExtensions) {
    for (const tag of extension.constraintTags ?? []) {
      names.add(normalizeFormSpecTagName(tag.tagName));
    }
    for (const slot of extension.metadataSlots ?? []) {
      names.add(normalizeFormSpecTagName(slot.tagName));
    }
    for (const annotation of extension.annotations ?? []) {
      names.add(normalizeFormSpecTagName(annotation.annotationName));
    }
  }
  return [...names].sort();
}
