/**
 * TSDoc DocNode text extraction utilities for FormSpec tooling.
 *
 * Provides helpers for walking TSDoc DocNode trees and extracting plain text
 * content from DocBlock nodes.
 */

import {
  DocExcerpt,
  DocPlainText,
  DocSoftBreak,
  type DocNode,
  type DocBlock,
} from "@microsoft/tsdoc";

// =============================================================================
// TEXT EXTRACTION
// =============================================================================

/**
 * Recursively extracts plain text content from a TSDoc DocNode tree.
 *
 * Walks child nodes and concatenates DocPlainText and DocSoftBreak content.
 */
export function extractPlainText(node: DocNode): string {
  let result = "";
  if (node instanceof DocExcerpt) {
    return node.content.toString();
  }
  if (node instanceof DocPlainText) {
    return node.text;
  }
  if (node instanceof DocSoftBreak) {
    return " ";
  }
  for (const child of node.getChildNodes()) {
    result += extractPlainText(child);
  }
  return result;
}

/**
 * Extracts the plain text content from a TSDoc DocBlock node.
 */
export function extractBlockText(block: DocBlock): string {
  return extractPlainText(block.content);
}

/**
 * Chooses the best payload text between a primary (shared syntax parse) source
 * and a fallback (TS compiler JSDoc API) source.
 *
 * Prefers the primary source unless the alternate is longer and starts with the
 * primary (indicating the compiler API captured more content), or the alternate
 * contains newlines (indicating multi-line content that the shared parser may
 * have truncated).
 */
export function choosePreferredPayloadText(primary: string, fallback: string): string {
  const preferred = primary.trim();
  const alternate = fallback.trim();

  if (preferred === "") return alternate;
  if (alternate === "") return preferred;
  if (alternate.includes("\n")) return alternate;
  if (alternate.length > preferred.length && alternate.startsWith(preferred)) {
    return alternate;
  }

  return preferred;
}
