/**
 * Classifies whether a JSON-shaped tag argument has balanced bracket/brace
 * delimiters before the JSON parser decides whether the value is valid JSON.
 *
 * This deliberately does not validate JSON syntax. Balanced-but-invalid JSON
 * such as `[1,2,]` must still reach the existing raw-string fallback paths.
 *
 * @internal
 */
type JsonLikeBalanceStatus = "not-json-like" | "balanced" | "unbalanced";

function expectedCloseFor(open: string): "]" | "}" | null {
  if (open === "[") return "]";
  if (open === "{") return "}";
  return null;
}

/**
 * Incrementally tracks bracket/brace balance for a JSON-shaped text stream.
 *
 * @internal
 */
export function createJsonLikeBalanceTracker(): { append(text: string): number | null } {
  const expectedClosers: string[] = [];
  let offset = 0;
  let started = false;
  let failed = false;
  let inString = false;
  let escaped = false;
  let balancedEnd: number | null = null;

  return {
    append(text: string): number | null {
      if (failed || balancedEnd !== null) {
        offset += text.length;
        return balancedEnd;
      }

      for (let localIndex = 0; localIndex < text.length; localIndex += 1) {
        const char = text[localIndex];
        const absoluteEnd = offset + localIndex + 1;

        if (!started) {
          if (char === " " || char === "\t" || char === "\n" || char === "\r") {
            continue;
          }

          const firstExpectedClose = expectedCloseFor(char ?? "");
          if (firstExpectedClose === null) {
            failed = true;
            continue;
          }

          expectedClosers.push(firstExpectedClose);
          started = true;
          continue;
        }

        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (char === "\\") {
            escaped = true;
          } else if (char === '"') {
            inString = false;
          }
          continue;
        }

        if (char === '"') {
          inString = true;
          continue;
        }

        const openerExpectedClose = expectedCloseFor(char ?? "");
        if (openerExpectedClose !== null) {
          expectedClosers.push(openerExpectedClose);
          continue;
        }

        if (char === "]" || char === "}") {
          const expected = expectedClosers.pop();
          if (expected !== char) {
            failed = true;
            continue;
          }
          if (expectedClosers.length === 0) {
            balancedEnd = absoluteEnd;
            break;
          }
        }
      }

      offset += text.length;
      return balancedEnd;
    },
  };
}

/**
 * Finds the one-past-the-end offset of the first balanced JSON-shaped bracket
 * structure in text, starting at the first non-whitespace character.
 *
 * @internal
 */
function findJsonLikeBalancedEnd(rawArgumentText: string): number | null {
  return createJsonLikeBalanceTracker().append(rawArgumentText);
}

/**
 * Returns whether a raw argument begins with a bracketed JSON-shaped structure
 * and, if so, whether that structure is balanced. "Unbalanced" covers both
 * missing closing delimiters and mismatched delimiters.
 *
 * @internal
 */
export function getJsonLikeBalanceStatus(rawArgumentText: string): JsonLikeBalanceStatus {
  const start = rawArgumentText.search(/\S/u);
  if (start < 0) {
    return "not-json-like";
  }

  if (expectedCloseFor(rawArgumentText[start] ?? "") === null) {
    return "not-json-like";
  }

  return findJsonLikeBalancedEnd(rawArgumentText) === null ? "unbalanced" : "balanced";
}
