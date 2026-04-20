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
  readonly constraintTags?: readonly { readonly tagName: unknown }[];
  readonly metadataSlots?: readonly { readonly tagName: unknown }[];
  readonly annotations?: readonly { readonly annotationName: unknown }[];
}

/**
 * Strips a leading `@` from a tag name (if present) then normalizes it.
 *
 * Extension registries may store tag names with or without a leading `@`.
 * The scanner always produces normalized names _without_ the `@`, so we must
 * strip it before building the lookup set.
 */
function normalizeExtensionTagName(rawName: string): string {
  const stripped = rawName.startsWith("@") ? rawName.slice(1) : rawName;
  return normalizeFormSpecTagName(stripped);
}

/**
 * Reads all tag names registered by extensions in `context.settings`.
 *
 * Covers constraint tags, metadata slots, and annotation tags — all three
 * can be authored as TSDoc block tags in FormSpec class declarations.
 *
 * Returns a deduplicated set of normalized tag names (no `@` prefix).
 * Non-object extensions and entries whose name is not a string are silently
 * skipped so malformed `context.settings` input does not cause runtime errors.
 */
export function readExtensionTagNames(
  settings: Readonly<Record<string, unknown>>
): ReadonlySet<string> {
  const formspec = settings["formspec"];
  if (typeof formspec !== "object" || formspec === null) return new Set();
  const registry = (formspec as Record<string, unknown>)["extensionRegistry"];
  if (typeof registry !== "object" || registry === null) return new Set();
  const extensions = (registry as Partial<SettingsExtensionRegistry>).extensions;
  if (!Array.isArray(extensions)) return new Set();
  const names = new Set<string>();
  for (const extension of extensions) {
    if (typeof extension !== "object" || extension === null) continue;
    const typedExtension = extension as SettingsExtensionDefinition;
    for (const tag of typedExtension.constraintTags ?? []) {
      if (typeof tag.tagName === "string") names.add(normalizeExtensionTagName(tag.tagName));
    }
    for (const slot of typedExtension.metadataSlots ?? []) {
      if (typeof slot.tagName === "string") names.add(normalizeExtensionTagName(slot.tagName));
    }
    for (const annotation of typedExtension.annotations ?? []) {
      if (typeof annotation.annotationName === "string")
        names.add(normalizeExtensionTagName(annotation.annotationName));
    }
  }
  return names;
}
