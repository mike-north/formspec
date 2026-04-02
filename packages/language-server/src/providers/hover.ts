/**
 * Hover provider for FormSpec JSDoc tags.
 *
 * Uses the shared registry from `@formspec/analysis` so hover content stays in
 * sync with the tag inventory and overload metadata.
 */

import {
  type FormSpecSerializedHoverInfo,
  getCommentHoverInfoAtOffset,
  getTagDefinition,
  normalizeFormSpecTagName,
} from "@formspec/analysis/internal";
import type { ExtensionDefinition } from "@formspec/core";
import type { Hover } from "vscode-languageserver/node.js";

/**
 * Returns hover content for a single FormSpec tag name.
 *
 * @public
 */
export function getHoverForTag(
  tagName: string,
  extensions?: readonly ExtensionDefinition[]
): Hover | null {
  const raw = tagName.startsWith("@") ? tagName.slice(1) : tagName;
  const definition = getTagDefinition(normalizeFormSpecTagName(raw), extensions);
  if (!definition) {
    return null;
  }

  return {
    contents: {
      kind: "markdown",
      value: definition.hoverMarkdown,
    },
  };
}

/**
 * Returns LSP hover content for the cursor position at `offset` in `documentText`.
 *
 * When `semanticHover` is supplied (e.g. from {@link getPluginHoverForDocument}), it is used
 * directly as the hover source. Pass `null` or omit it to fall back to syntax-only analysis,
 * which works without the TypeScript plugin. Returns `null` when the cursor is not over a
 * recognised FormSpec tag.
 *
 * @public
 */
export function getHoverAtOffset(
  documentText: string,
  offset: number,
  extensions?: readonly ExtensionDefinition[],
  semanticHover?: FormSpecSerializedHoverInfo | null
): Hover | null {
  const hoverInfo =
    semanticHover ??
    getCommentHoverInfoAtOffset(documentText, offset, extensions ? { extensions } : undefined);
  if (hoverInfo === null) {
    return null;
  }

  return {
    contents: {
      kind: "markdown",
      value: hoverInfo.markdown,
    },
  };
}
