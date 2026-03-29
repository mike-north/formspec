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
} from "@formspec/analysis";
import type { ExtensionDefinition } from "@formspec/core";
import type { Hover } from "vscode-languageserver/node.js";

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

/** @internal */
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
