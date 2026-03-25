/**
 * Shared JSON parsing utilities for the analyzer pipeline.
 */

/**
 * Attempts to parse `text` as JSON.
 *
 * Returns the parsed value on success, or `null` if the input is not valid
 * JSON. This is the canonical "try-parse" wrapper used by the constraint tag
 * parsers so that every `JSON.parse` call in this package is consistent and
 * centrally tested.
 *
 * Note: when the input is the literal string `"null"`, the return value is
 * also `null` (valid JSON). Callers that need to distinguish parse failure
 * from a successfully-parsed `null` should use a stricter check (e.g.
 * `Array.isArray`), as both callers in this package already do.
 *
 * @param text - Raw string to parse
 * @returns The parsed value, or `null` on parse failure
 */
export function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
