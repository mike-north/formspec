/**
 * Shared TSDoc configuration and parser instance cache for FormSpec tooling.
 *
 * Provides the canonical TSDocConfiguration with all FormSpec custom block
 * tags registered, and a cached parser factory so the same TSDocParser
 * instance is reused across calls with matching extension tags.
 */

import {
  TSDocConfiguration,
  TSDocTagDefinition,
  TSDocTagSyntaxKind,
  TSDocParser,
} from "@microsoft/tsdoc";
import { BUILTIN_CONSTRAINT_DEFINITIONS } from "@formspec/core/internals";

// =============================================================================
// RAW TEXT TAGS
// =============================================================================

/**
 * Tags whose content may contain TSDoc-significant characters (`{}`, `@`)
 * and are extracted via raw span-based slicing of the original source text,
 * with the TS compiler JSDoc API as a fallback in the build pipeline.
 * This avoids content mangling that would occur if the TSDoc DocNode tree
 * were used directly.
 *
 * - `@pattern`: regex patterns commonly contain `@` (e.g. email validation)
 * - `@enumOptions`: JSON arrays may contain object literals with `{}`
 * - `@defaultValue`: JSON defaults may contain objects, arrays, or quoted strings
 */
export const TAGS_REQUIRING_RAW_TEXT = new Set(["pattern", "enumOptions", "defaultValue"]);

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Creates a TSDocConfiguration with FormSpec custom block tag definitions
 * registered for all constraint tags.
 *
 * Registers:
 * - All builtin constraint tags from BUILTIN_CONSTRAINT_DEFINITIONS
 * - FormSpec annotation and structure tags (apiName, displayName, format, etc.)
 * - Extension tags from the passed-in list
 *
 * All tags are registered as BlockTag with allowMultiple: true.
 */
function createFormSpecTSDocConfig(
  extensionTagNames: readonly string[] = []
): TSDocConfiguration {
  const config = new TSDocConfiguration();
  const registered = new Set<string>();

  function registerTag(tagName: string): void {
    if (registered.has(tagName)) return;
    registered.add(tagName);
    config.addTagDefinition(
      new TSDocTagDefinition({
        tagName: "@" + tagName,
        syntaxKind: TSDocTagSyntaxKind.BlockTag,
        allowMultiple: true,
      })
    );
  }

  // Register each constraint tag as a custom block tag (allowMultiple so
  // repeated tags don't produce warnings).
  for (const tagName of Object.keys(BUILTIN_CONSTRAINT_DEFINITIONS)) {
    registerTag(tagName);
  }

  // Register FormSpec annotation and structure tags so summary extraction
  // stops at recognized tags and mid-prose mentions are parsed as real
  // tags per TSDoc semantics. Tags that are standard TSDoc (@description,
  // @example, @defaultValue, @deprecated) are already registered.
  for (const tagName of [
    "apiName",
    "displayName",
    "format",
    "placeholder",
    "order",
    "group",
    "showWhen",
    "hideWhen",
    "enableWhen",
    "disableWhen",
    "discriminator",
  ]) {
    registerTag(tagName);
  }

  for (const tagName of extensionTagNames) {
    registerTag(tagName);
  }

  return config;
}

// =============================================================================
// PARSER CACHE
// =============================================================================

/**
 * Shared parser instance — thread-safe because TSDocParser is stateless;
 * all parse state lives in the returned ParserContext.
 */
const parserCache = new Map<string, TSDocParser>();

/**
 * Returns a cached TSDocParser for the given sorted list of extension tag names.
 *
 * Parser instances are keyed by the sorted, pipe-joined extension tag names so
 * that identical extension sets reuse the same parser instance.
 */
export function getOrCreateTSDocParser(extensionTagNames: readonly string[]): TSDocParser {
  const cacheKey = [...extensionTagNames].sort().join("|");
  const existing = parserCache.get(cacheKey);
  if (existing !== undefined) {
    return existing;
  }

  const parser = new TSDocParser(createFormSpecTSDocConfig(extensionTagNames));
  parserCache.set(cacheKey, parser);
  return parser;
}
