/**
 * Formatting helpers for FormSpec vendor extension keywords.
 *
 * The serialization bounded context owns the conversion from logical keyword
 * names to extension-transport JSON Schema keys so every emitter applies the
 * same casing and well-formedness rules.
 */

/**
 * Well-formed FormSpec extension keyword pattern.
 *
 * Extension transport uses `x-<vendor>-<keyword>`, where both vendor and
 * keyword segments are lowercase ASCII and the keyword local part is kebab-case.
 */
export const FORMSPEC_EXTENSION_KEY_PATTERN = /^x-[a-z0-9]+-[a-z][a-z0-9-]*$/;

/** Well-formed vendor prefix pattern for extension transport. */
export const FORMSPEC_VENDOR_PREFIX_PATTERN = /^x-[a-z0-9]+$/;

/** Returns whether a configured vendor prefix can produce well-formed keys. */
export function isWellFormedVendorPrefix(vendorPrefix: string): boolean {
  return FORMSPEC_VENDOR_PREFIX_PATTERN.test(vendorPrefix);
}

/**
 * Converts an internal logical keyword name into the kebab-case local part used
 * by extension transport.
 */
export function toKebabCase(logicalName: string): string {
  return logicalName
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}
