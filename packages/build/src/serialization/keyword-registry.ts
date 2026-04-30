/**
 * Registry of FormSpec-owned JSON Schema serialization keywords.
 *
 * Every built-in vendor keyword emitted by `@formspec/build` must be declared
 * here before it can be written. PR-1 keeps all active output on extension
 * transport while preserving the vocabulary classification needed by PR-2.
 */

import { toKebabCase } from "./vendor-key-format.js";

/** Transport families supported by FormSpec keyword emission. */
export type TransportPreference = "vocabulary" | "extension" | "either";

/** Registry entry for a FormSpec-owned serialization keyword. */
export interface KeywordEntry {
  /** Logical camelCase keyword name used by FormSpec internals. */
  readonly logicalName: string;
  /** Vocabulary identifier that will own this keyword in PR-2. */
  readonly vocabularyId: string;
  /** Preferred transport for the keyword. */
  readonly transportPreference: TransportPreference;
}

/** Stable identifiers for the v1 FormSpec JSON Schema vocabularies. */
export const VOCABULARY_IDS = {
  dynamicOptions: "dynamic-options",
  dynamicSchema: "dynamic-schema",
  metadata: "metadata",
  schemaPolicy: "schema-policy",
} as const;

/** Complete v1 keyword registry. */
export const KEYWORD_REGISTRY = [
  {
    logicalName: "optionSource",
    vocabularyId: VOCABULARY_IDS.dynamicOptions,
    transportPreference: "vocabulary",
  },
  {
    logicalName: "optionSourceParams",
    vocabularyId: VOCABULARY_IDS.dynamicOptions,
    transportPreference: "vocabulary",
  },
  {
    logicalName: "schemaSource",
    vocabularyId: VOCABULARY_IDS.dynamicSchema,
    transportPreference: "vocabulary",
  },
  {
    logicalName: "passthroughObject",
    vocabularyId: VOCABULARY_IDS.schemaPolicy,
    transportPreference: "either",
  },
  {
    logicalName: "displayNames",
    vocabularyId: VOCABULARY_IDS.metadata,
    transportPreference: "either",
  },
  {
    logicalName: "remarks",
    vocabularyId: VOCABULARY_IDS.metadata,
    transportPreference: "extension",
  },
  {
    logicalName: "deprecationDescription",
    vocabularyId: VOCABULARY_IDS.metadata,
    transportPreference: "extension",
  },
] as const satisfies readonly KeywordEntry[];

/** Logical names registered for FormSpec serialization keywords. */
export type SerializationKeywordName = (typeof KEYWORD_REGISTRY)[number]["logicalName"];

/**
 * Verifies that extension-transport local names cannot collide.
 */
export function assertUniqueKebabNames(entries: readonly KeywordEntry[]): void {
  const byKebabName = new Map<string, KeywordEntry>();

  for (const entry of entries) {
    const kebabName = toKebabCase(entry.logicalName);
    const existing = byKebabName.get(kebabName);
    if (existing !== undefined) {
      throw new Error(
        `Serialization keywords collide after kebab-casing as "${kebabName}": ` +
          `${existing.logicalName} (${existing.vocabularyId}) and ` +
          `${entry.logicalName} (${entry.vocabularyId}).`
      );
    }
    byKebabName.set(kebabName, entry);
  }
}

assertUniqueKebabNames(KEYWORD_REGISTRY);
