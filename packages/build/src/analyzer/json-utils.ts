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
 * also `null` (valid JSON). This helper therefore cannot distinguish parse
 * failure from a successfully-parsed JSON `null`. Callers that need to
 * distinguish these cases should use a different API (for example, a wrapper
 * that returns a discriminated result such as `{ ok: boolean, value?: unknown }`).
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
