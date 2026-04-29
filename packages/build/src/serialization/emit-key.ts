/**
 * Keyword emission helper for the serialization bounded context.
 *
 * Generators call `emitKey()` with a logical keyword name instead of inventing
 * vendor-prefixed strings at each write site. That keeps current extension
 * output centralized and gives PR-2 one place to add vocabulary transport.
 */

import {
  KEYWORD_REGISTRY,
  type KeywordEntry,
  type SerializationKeywordName,
} from "./keyword-registry.js";
import type { SerializationContext } from "./output-writer.js";
import { FORMSPEC_EXTENSION_KEY_PATTERN, toKebabCase } from "./vendor-key-format.js";

const KEYWORDS_BY_LOGICAL_NAME = new Map<string, KeywordEntry>(
  KEYWORD_REGISTRY.map((entry) => [entry.logicalName, entry] as const)
);

/**
 * Looks up a registered FormSpec serialization keyword by logical name.
 */
function getKeywordEntry(logicalName: string): KeywordEntry | undefined {
  return KEYWORDS_BY_LOGICAL_NAME.get(logicalName);
}

/**
 * Emits the concrete JSON Schema key for a registered logical keyword.
 */
export function emitKey(
  logicalName: SerializationKeywordName,
  ctx: SerializationContext
): `x-${string}`;
export function emitKey(logicalName: string, ctx: SerializationContext): `x-${string}` {
  const entry = getKeywordEntry(logicalName);
  if (entry === undefined) {
    throw new Error(`Unregistered FormSpec serialization keyword "${logicalName}".`);
  }

  const resolvedTransport =
    ctx.defaultTransport === "extension"
      ? "extension"
      : entry.transportPreference === "either"
        ? ctx.defaultTransport
        : entry.transportPreference;
  if (resolvedTransport === "extension") {
    const key = `${ctx.vendorPrefix}-${toKebabCase(entry.logicalName)}`;
    if (!FORMSPEC_EXTENSION_KEY_PATTERN.test(key)) {
      throw new Error(
        `Invalid FormSpec extension keyword "${key}". Expected format x-<vendor>-<kebab-keyword>.`
      );
    }
    return key as `x-${string}`;
  }

  throw new Error(
    `Vocabulary transport for FormSpec keyword "${entry.logicalName}" is not implemented in PR-1.`
  );
}
