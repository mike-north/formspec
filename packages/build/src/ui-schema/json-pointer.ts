/**
 * Shared RFC 6901 JSON Pointer token helpers.
 *
 * JSON Forms UI Schema scopes are JSON Pointers (e.g. `#/properties/name`).
 * Property names embedded in a pointer are *reference tokens* and must be
 * escaped per RFC 6901 §3: `~` becomes `~0` and `/` becomes `~1`. Without this
 * escaping, a property named `a/b` would serialize to `#/properties/a/b`, which
 * a JSON Pointer consumer reads as two segments (`a` then `b`) and fails to
 * resolve. These helpers are the single source of truth for encoding a logical
 * property name into a pointer token and decoding it back.
 *
 * Only `~` and `/` are structurally significant to JSON Pointer, so no other
 * characters (spaces, Unicode, URI-reserved characters) are transformed here.
 * JSON Forms resolves scopes by splitting on `/` and applying the same
 * RFC 6901 decode, so it consumes these tokens verbatim without URI decoding.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc6901
 */

/**
 * Encodes a single logical property name as an RFC 6901 reference token.
 *
 * Per RFC 6901 §3 the `~` escape must be applied before the `/` escape, so
 * that a literal `~1` in the input is not later misread as an escaped `/`.
 *
 * @param token - The unescaped logical property name.
 * @returns The RFC 6901-escaped reference token.
 */
export function encodeJsonPointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Decodes a single RFC 6901 reference token back to its logical property name.
 *
 * The inverse escape order of {@link encodeJsonPointerToken}: `~1` is decoded
 * to `/` before `~0` is decoded to `~`, so that an escaped `~1` (originating
 * from a literal `/`) is not first turned into `/` and then reprocessed.
 *
 * @param token - The RFC 6901-escaped reference token.
 * @returns The unescaped logical property name.
 */
export function decodeJsonPointerToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}
